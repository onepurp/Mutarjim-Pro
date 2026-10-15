
import JSZip from 'jszip';
import { AnalysisResult, Segment, SegmentStatus, ProjectData, ExportSettings, TocItem, GlossaryTerm } from '../types';

const BLOCK_TAGS = ['p', 'div', 'table', 'blockquote', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'aside', 'main', 'header', 'footer'];
const BREAKER_TAGS = ['img', 'hr', 'pre', 'svg', 'figure'];
const HEADER_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const BATCH_CHAR_LIMIT = 6000;
const SCHEMA_VERSION = 2; // V2 supports text nodes

export function normalizeZipPath(path: string): string {
  if (!path) return '';
  try { path = decodeURIComponent(path); } catch (e) {}
  path = path.split('#')[0].split('?')[0];
  path = path.replace(/\\/g, '/').trim();
  const parts = path.split('/');
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return stack.join('/').toLowerCase();
}

export const epubService = {
  async parseAndSegment(file: File): Promise<AnalysisResult> {
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(file);

    // 1. Locate OPF
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) throw new Error('Invalid EPUB: Missing container.xml');
    
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'application/xml');
    // Use getElementsByTagName to avoid namespace issues
    const rootfile = containerDoc.getElementsByTagName('rootfile')[0];
    const opfPath = rootfile?.getAttribute('full-path');
    if (!opfPath) throw new Error('Invalid EPUB: Missing OPF path');

    const opfContent = await zip.file(opfPath)?.async('string');
    if (!opfContent) throw new Error('OPF file not found');
    const opfDoc = parser.parseFromString(opfContent, 'application/xml');

    // 2. Extract Metadata
    const metadata = opfDoc.getElementsByTagName('metadata')[0] || opfDoc.getElementsByTagNameNS('*', 'metadata')[0];
    
    const getMetaText = (tagName: string) => {
        if (!metadata) return null;
        const els = metadata.getElementsByTagName(tagName);
        if (els.length > 0) return els[0].textContent;
        const elsNS = metadata.getElementsByTagNameNS('*', tagName);
        if (elsNS.length > 0) return elsNS[0].textContent;
        return null;
    };

    const title = getMetaText('title') || 'Unknown Title';
    const creator = getMetaText('creator') || 'Unknown Author';
    
    // Attempt to find cover
    let coverUrl: string | undefined;
    const manifest = opfDoc.getElementsByTagName('manifest')[0] || opfDoc.getElementsByTagNameNS('*', 'manifest')[0];
    const manifestItems = Array.from(manifest?.getElementsByTagName('item') || []);
    // Fallback for NS
    if (manifestItems.length === 0 && manifest) {
        manifestItems.push(...Array.from(manifest.getElementsByTagNameNS('*', 'item')));
    }

    const coverItem = manifestItems.find(item => {
      const id = item.getAttribute('id')?.toLowerCase() || '';
      const props = item.getAttribute('properties') || '';
      return id.includes('cover') || props.includes('cover-image');
    });

    if (coverItem) {
      const href = coverItem.getAttribute('href');
      if (href) {
        // Resolve path relative to OPF
        const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'));
        const coverPath = opfDir ? `${opfDir}/${href}` : href;
        const coverBlob = await zip.file(coverPath)?.async('blob');
        if (coverBlob) coverUrl = URL.createObjectURL(coverBlob);
      }
    }

    // 3. Parse Spine
    const spine = opfDoc.getElementsByTagName('spine')[0] || opfDoc.getElementsByTagNameNS('*', 'spine')[0];
    const spineRefs = Array.from(spine?.getElementsByTagName('itemref') || []);
    if (spineRefs.length === 0 && spine) {
        spineRefs.push(...Array.from(spine.getElementsByTagNameNS('*', 'itemref')));
    }

    const segments: Segment[] = [];
    
    for (const ref of spineRefs) {
      const idref = ref.getAttribute('idref');
      if (!idref) continue;

      const item = manifestItems.find(i => i.getAttribute('id') === idref);
      const href = item?.getAttribute('href');
      
      if (href) {
        // Resolve path
        const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'));
        const fullPath = opfDir ? `${opfDir}/${href}` : href;
        
        const htmlContent = await zip.file(fullPath)?.async('string');
        if (htmlContent) {
           const fileSegments = this.segmentHtmlV2(htmlContent, fullPath);
           segments.push(...fileSegments);
        }
      }
    }

    // 4. Extract Table of Contents (TOC) with segment mapping
    const toc = await this.extractToc(zip, opfDoc, opfPath, manifestItems, segments);

    const projectData: ProjectData = {
      id: 'current-project',
      title,
      author: creator,
      coverUrl,
      totalSegments: segments.length,
      translatedSegments: 0,
      sourceEpubBlob: file,
      createdAt: Date.now(),
      schemaVersion: SCHEMA_VERSION,
      toc
    };

    return { project: projectData, segments };
  },

  // --- V2 Segmentation (Handles mixed content / text nodes) ---
  segmentHtmlV2(html: string, fileHref: string): Segment[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'application/xhtml+xml');
    const segments: Segment[] = [];
    let currentBatch: Node[] = [];
    let currentBatchLength = 0;
    let batchIndex = 0;

    const flushBatch = () => {
      if (currentBatch.length > 0) {
        const serializer = new XMLSerializer();
        const originalHtml = currentBatch.map(node => serializer.serializeToString(node)).join('');
        segments.push({
          id: `${fileHref}::${batchIndex++}`,
          fileHref,
          batchIndex: batchIndex - 1,
          originalHtml,
          translatedHtml: '',
          status: SegmentStatus.PENDING,
          retryCount: 0,
        });
        currentBatch = [];
        currentBatchLength = 0;
      }
    };

    const isTranslatableElement = (el: Element): boolean => {
      const tagName = el.tagName.toLowerCase();
      if (!BLOCK_TAGS.includes(tagName)) return false;
      if (!el.textContent?.trim()) return false;
      
      const hasBlockChildren = Array.from(el.children).some(child => 
        BLOCK_TAGS.includes(child.tagName.toLowerCase()) || 
        BREAKER_TAGS.includes(child.tagName.toLowerCase())
      );
      return !hasBlockChildren;
    };

    const traverse = (node: Node) => {
       if (node.nodeType === Node.ELEMENT_NODE) {
           const el = node as Element;
           const tagName = el.tagName.toLowerCase();

           if (BREAKER_TAGS.includes(tagName)) {
             flushBatch();
             return; 
           }

           if (HEADER_TAGS.includes(tagName)) {
             flushBatch();
             currentBatch.push(node);
             flushBatch();
             return;
           }

           if (isTranslatableElement(el)) {
             const html = new XMLSerializer().serializeToString(el);
             if (currentBatchLength + html.length > BATCH_CHAR_LIMIT) {
               flushBatch();
             }
             currentBatch.push(node);
             currentBatchLength += html.length;
             return; // Don't traverse children of a block we just captured
           }

           // Traverse children
           Array.from(node.childNodes).forEach(traverse);
       
       } else if (node.nodeType === Node.TEXT_NODE) {
           // Capture orphan text nodes (mixed content)
           if (node.textContent?.trim()) {
               const len = node.textContent.length;
               if (currentBatchLength + len > BATCH_CHAR_LIMIT) {
                   flushBatch();
               }
               currentBatch.push(node);
               currentBatchLength += len;
           }
       }
    };

    if (doc.body) {
        Array.from(doc.body.childNodes).forEach(traverse);
    }
    flushBatch();

    return segments;
  },

  // --- Legacy Segmentation (For backward compatibility) ---
  segmentHtmlLegacy(html: string, fileHref: string): Segment[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'application/xhtml+xml');
    if (doc.body) {
        return this.segmentHtmlRecursiveLegacy(doc.body, fileHref);
    }
    return [];
  },

  segmentHtmlRecursiveLegacy(root: Element, fileHref: string): Segment[] {
    const segments: Segment[] = [];
    let currentBatch: Element[] = [];
    let currentBatchLength = 0;
    let batchIndex = 0;

    const flushBatch = () => {
      if (currentBatch.length > 0) {
        const originalHtml = currentBatch.map(el => el.outerHTML).join('');
        segments.push({
          id: `${fileHref}::${batchIndex++}`,
          fileHref,
          batchIndex: batchIndex - 1,
          originalHtml,
          translatedHtml: '',
          status: SegmentStatus.PENDING,
          retryCount: 0,
        });
        currentBatch = [];
        currentBatchLength = 0;
      }
    };

    const isTranslatableBlock = (el: Element): boolean => {
      const tagName = el.tagName.toLowerCase();
      if (!BLOCK_TAGS.includes(tagName)) return false;
      if (!el.textContent?.trim()) return false;
      const hasBlockChildren = Array.from(el.children).some(child => 
        BLOCK_TAGS.includes(child.tagName.toLowerCase()) || 
        BREAKER_TAGS.includes(child.tagName.toLowerCase())
      );
      return !hasBlockChildren;
    };

    const traverse = (node: Element) => {
       const tagName = node.tagName.toLowerCase();
       if (BREAKER_TAGS.includes(tagName)) { flushBatch(); return; }
       if (HEADER_TAGS.includes(tagName)) { flushBatch(); currentBatch.push(node); flushBatch(); return; }
       if (isTranslatableBlock(node)) {
         if (currentBatchLength + node.outerHTML.length > BATCH_CHAR_LIMIT) { flushBatch(); }
         currentBatch.push(node);
         currentBatchLength += node.outerHTML.length;
         return;
       }
       for (const child of Array.from(node.children)) { traverse(child); }
    };
    Array.from(root.children).forEach(traverse);
    flushBatch();
    return segments;
  },

  async reassembleEpub(
      originalBlob: Blob, 
      segments: Segment[], 
      customCoverBlob?: Blob, 
      options?: { 
          arabicTitle?: string, 
          author?: string, 
          originalTitle?: string, 
          schemaVersion?: number,
          exportSettings?: ExportSettings,
          toc?: TocItem[],
          glossary?: GlossaryTerm[]
      }
  ): Promise<Blob> {
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(originalBlob);
    const isV2 = options?.schemaVersion === 2;

    const settings: ExportSettings = options?.exportSettings || {
        textAlignment: 'right',
        forceAlignment: false
    };

    const segmentsByFile: Record<string, Segment[]> = {};
    segments.forEach(s => {
      if (!segmentsByFile[s.fileHref]) segmentsByFile[s.fileHref] = [];
      segmentsByFile[s.fileHref].push(s);
    });

    for (const [fileHref, fileSegments] of Object.entries(segmentsByFile)) {
      fileSegments.sort((a, b) => a.batchIndex - b.batchIndex);
      
      const content = await zip.file(fileHref)?.async('string');
      if (!content) continue;

      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xhtml+xml');
      
      // 1. Basic RTL attributes (Standard for Arabic)
      if (doc.body) {
          doc.body.setAttribute('dir', 'rtl');
          doc.body.setAttribute('lang', 'ar');
      }
      if (doc.documentElement) {
          doc.documentElement.setAttribute('lang', 'ar');
      }

      // 2. Generate CSS based on alignment settings
      const alignVal = settings.textAlignment;
      const isForced = settings.forceAlignment;
      const importance = isForced ? '!important' : '';

      let alignmentCss = `
        html, body {
            direction: rtl ${importance};
        }
      `;

      if (isForced) {
           // Aggressive override: Targets common block elements to force alignment
           alignmentCss += `
             html, body, p, div, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, article, section {
                 text-align: ${alignVal} ${importance};
             }
           `;
           // If Justify is forced, we might need extra properties for better rendering
           if (alignVal === 'justify') {
               alignmentCss += `
                 html, body, p, div, li {
                     text-justify: inter-word ${importance};
                 }
               `;
           }
      } else {
           // Soft override: Only set default on body/html.
           // This allows specific styles in the book (e.g. <p class="center">) to take precedence via CSS specificity.
           alignmentCss += `
             html, body {
                 text-align: ${alignVal};
             }
             /* Protect tables and lists from breaking structure while keeping RTL */
             ul, ol, table {
                 direction: rtl; 
             }
           `;
      }

      const styleEl = doc.createElement('style');
      styleEl.textContent = alignmentCss;
      
      // Prepend to HEAD to allow original styles to override if forceAlignment is false
      if (doc.head) {
        if (doc.head.firstChild) {
            doc.head.insertBefore(styleEl, doc.head.firstChild);
        } else {
            doc.head.appendChild(styleEl);
        }
      } else if (doc.body) {
        doc.body.insertBefore(styleEl, doc.body.firstChild);
      }

      let segmentIndex = 0;
      let currentBatchNodes: Node[] = []; 

      // --- Helpers for Reassembly ---
      const processBatch = () => {
        if (currentBatchNodes.length === 0) return;
        
        const segment = fileSegments[segmentIndex];
        
        if (segment && segment.status === SegmentStatus.TRANSLATED) {
           const firstNode = currentBatchNodes[0];
           const insertionParent = firstNode.parentElement; 
           
           if (insertionParent) {
             let nodesToInsert: Node[] = [];
             
             try {
                // Try strictly valid XHTML first
                const tempDoc = new DOMParser().parseFromString(`<div>${segment.translatedHtml}</div>`, 'application/xhtml+xml');
                if (tempDoc.getElementsByTagName('parsererror').length > 0) throw new Error('XML Parse Error');
                const root = tempDoc.documentElement;
                while(root.firstChild) {
                    nodesToInsert.push(doc.importNode(root.firstChild, true));
                    root.removeChild(root.firstChild);
                }
             } catch (e) {
                // Fallback strategies (Entitites, then HTML loose)
                try {
                    const fixedHtml = segment.translatedHtml.replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;');
                    const tempDoc = new DOMParser().parseFromString(`<div>${fixedHtml}</div>`, 'application/xhtml+xml');
                    if (tempDoc.getElementsByTagName('parsererror').length > 0) throw new Error('XML Parse Error after fix');
                    const root = tempDoc.documentElement;
                    while(root.firstChild) {
                        nodesToInsert.push(doc.importNode(root.firstChild, true));
                        root.removeChild(root.firstChild);
                    }
                } catch (e2) {
                    const tempDoc = new DOMParser().parseFromString(`<body>${segment.translatedHtml}</body>`, 'text/html');
                    while(tempDoc.body.firstChild) {
                        nodesToInsert.push(doc.importNode(tempDoc.body.firstChild, true));
                        tempDoc.body.removeChild(tempDoc.body.firstChild);
                    }
                }
             }

             // 1. INSERTION
             for (const node of nodesToInsert) {
               if (node.nodeType === Node.ELEMENT_NODE) {
                  // Ensure explicit RTL direction on inserted blocks if needed
                  (node as Element).setAttribute('dir', 'rtl');
               }
               insertionParent.insertBefore(node, firstNode);
             }
             
             // 2. DELETION
             currentBatchNodes.forEach(n => {
                if (n.nodeName === 'BODY' || n.nodeName === 'HTML' || n.nodeName === 'HEAD') return;
                if (n.parentNode) {
                    n.parentNode.removeChild(n);
                }
             });
           }
        }
        segmentIndex++;
        currentBatchNodes = [];
      };

      // --- Traversal V2 ---
      const traverseV2 = (node: Node) => {
         if (node.nodeType === Node.ELEMENT_NODE) {
             const el = node as Element;
             const tagName = el.tagName.toLowerCase();

             if (BREAKER_TAGS.includes(tagName)) { processBatch(); return; }
             if (HEADER_TAGS.includes(tagName)) { processBatch(); currentBatchNodes.push(node); processBatch(); return; }

             const isTranslatableElement = (el: Element): boolean => {
                if (!BLOCK_TAGS.includes(el.tagName.toLowerCase())) return false;
                if (!el.textContent?.trim()) return false;
                const hasBlockChildren = Array.from(el.children).some(child => 
                    BLOCK_TAGS.includes(child.tagName.toLowerCase()) || 
                    BREAKER_TAGS.includes(child.tagName.toLowerCase())
                );
                return !hasBlockChildren;
             };

             if (isTranslatableElement(el)) {
                 const html = new XMLSerializer().serializeToString(el);
                 const currentBatchSize = currentBatchNodes.reduce((acc, n) => acc + (n.nodeType === Node.ELEMENT_NODE ? (n as Element).outerHTML.length : (n.textContent?.length || 0)), 0);
                 if (currentBatchSize + html.length > BATCH_CHAR_LIMIT && currentBatchNodes.length > 0) {
                     processBatch();
                 }
                 currentBatchNodes.push(node);
                 return; 
             }
             
             Array.from(node.childNodes).forEach(traverseV2);

         } else if (node.nodeType === Node.TEXT_NODE) {
             if (node.textContent?.trim()) {
                 const len = node.textContent.length;
                 const currentBatchSize = currentBatchNodes.reduce((acc, n) => acc + (n.nodeType === Node.ELEMENT_NODE ? (n as Element).outerHTML.length : (n.textContent?.length || 0)), 0);
                 if (currentBatchSize + len > BATCH_CHAR_LIMIT && currentBatchNodes.length > 0) {
                     processBatch();
                 }
                 currentBatchNodes.push(node);
             }
         }
      };

      // --- Traversal Legacy ---
      const traverseLegacy = (node: Element) => {
        const tagName = node.tagName.toLowerCase();
        if (BREAKER_TAGS.includes(tagName)) { processBatch(); return; }
        if (HEADER_TAGS.includes(tagName)) { processBatch(); currentBatchNodes.push(node); processBatch(); return; }

        const isTranslatableBlock = (el: Element): boolean => {
          if (!BLOCK_TAGS.includes(el.tagName.toLowerCase())) return false;
          if (!el.textContent?.trim()) return false;
          const hasBlockChildren = Array.from(el.children).some(child => 
            BLOCK_TAGS.includes(child.tagName.toLowerCase()) || 
            BREAKER_TAGS.includes(child.tagName.toLowerCase())
          );
          return !hasBlockChildren;
        };

        if (isTranslatableBlock(node)) {
           const size = node.outerHTML.length;
           const currentBatchSize = currentBatchNodes.reduce((acc, n) => acc + (n as Element).outerHTML.length, 0);
           if (currentBatchSize + size > BATCH_CHAR_LIMIT && currentBatchNodes.length > 0) { processBatch(); }
           currentBatchNodes.push(node);
           return;
        }
        for (const child of Array.from(node.children)) { traverseLegacy(child); }
      };

      // Execute Logic based on version
      if (doc.body) {
          if (isV2) {
              Array.from(doc.body.childNodes).forEach(traverseV2);
          } else {
              Array.from(doc.body.children).forEach(traverseLegacy);
          }
      }
      processBatch(); 

      const serializer = new XMLSerializer();
      const newHtml = serializer.serializeToString(doc);
      zip.file(fileHref, newHtml);
    }

    // 2. Custom Cover (Keep existing)
    if (customCoverBlob) {
        // ... (existing code, compacted for brevity) ...
        const containerXml = await zip.file('META-INF/container.xml')?.async('string');
        if (containerXml) {
           const cDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
           const rootfile = cDoc.getElementsByTagName('rootfile')[0];
           const opfPath = rootfile?.getAttribute('full-path');
           if (opfPath) {
             const opfStr = await zip.file(opfPath)?.async('string');
             if (opfStr) {
               const opfDoc = new DOMParser().parseFromString(opfStr, 'application/xml');
               const manifest = opfDoc.getElementsByTagName('manifest')[0] || opfDoc.getElementsByTagNameNS('*', 'manifest')[0];
               const items = Array.from(manifest?.getElementsByTagName('item') || []);
               if (items.length === 0 && manifest) items.push(...Array.from(manifest.getElementsByTagNameNS('*', 'item')));
               const coverItem = items.find(item => item.getAttribute('id')?.toLowerCase().includes('cover') || item.getAttribute('properties') === 'cover-image');
               if (coverItem) {
                  const href = coverItem.getAttribute('href');
                  if (href) {
                     const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'));
                     const coverPath = opfDir ? `${opfDir}/${href}` : href;
                     zip.file(coverPath, customCoverBlob);
                  }
               }
             }
           }
        }
    }

    // 3. Update OPF Metadata
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (containerXml) {
       const cDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
       const rootfile = cDoc.getElementsByTagName('rootfile')[0];
       const opfPath = rootfile?.getAttribute('full-path');
       if (opfPath) {
         const opfStr = await zip.file(opfPath)?.async('string');
         if (opfStr) {
           const opfDoc = new DOMParser().parseFromString(opfStr, 'application/xml');
           
           // 3a. Update Spine Direction
           const spine = opfDoc.getElementsByTagName('spine')[0] || opfDoc.getElementsByTagNameNS('*', 'spine')[0];
           if (spine) {
               spine.setAttribute('page-progression-direction', 'rtl');
           }

           const metadata = opfDoc.getElementsByTagName('metadata')[0] || opfDoc.getElementsByTagNameNS('*', 'metadata')[0];
           if (metadata) {
             // Language Update
             let langEl = metadata.getElementsByTagName('language')[0] || metadata.getElementsByTagNameNS('*', 'language')[0];
             if (!langEl) {
                langEl = opfDoc.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:language');
                metadata.appendChild(langEl);
             }
             langEl.textContent = 'ar';
             
             const titleEl = metadata.getElementsByTagName('title')[0] || metadata.getElementsByTagNameNS('*', 'title')[0];
             if (titleEl) {
                 if (options?.arabicTitle) {
                     titleEl.textContent = options.arabicTitle;
                 }
             }
           }

            // 3b. Auto-enrich any missing arabicTitle from translated segments
            if (options?.toc && segments && segments.length > 0) {
              const enrichTocFromSegments = (items: TocItem[]) => {
                for (const it of items) {
                  if (!it.arabicTitle && typeof it.segmentIndex === 'number' && segments[it.segmentIndex]) {
                    const seg = segments[it.segmentIndex];
                    if (seg.translatedHtml && seg.status === SegmentStatus.TRANSLATED) {
                      const headingMatch = seg.translatedHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
                      if (headingMatch && headingMatch[1].trim()) {
                        const clean = headingMatch[1].replace(/<[^>]+>/g, '').trim();
                        if (clean.length > 0 && clean.length < 150) {
                          it.arabicTitle = clean;
                        }
                      }
                    }
                  }
                  if (it.subItems && it.subItems.length > 0) {
                    enrichTocFromSegments(it.subItems);
                  }
                }
              };
              enrichTocFromSegments(options.toc);
            }

            // Update or synthesize Table of Contents (TOC) with Arabic titles and RTL
            await this.updateTocOnExport(zip, opfPath, opfDoc, options);

            zip.file(opfPath, new XMLSerializer().serializeToString(opfDoc));
          }
        }
     }

    return await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  },

  // ... (keep segmentHtml for interface compatibility if needed, calling V2)
  segmentHtml(html: string, fileHref: string): Segment[] {
      return this.segmentHtmlV2(html, fileHref);
  },

  resolveZipHref(baseFilePath: string, relativeHref: string): { fullPath: string; anchorId?: string } {
    try { relativeHref = decodeURIComponent(relativeHref); } catch (e) {}
    const [cleanPath, anchor] = relativeHref.split('#');
    const baseDir = baseFilePath.includes('/') ? baseFilePath.substring(0, baseFilePath.lastIndexOf('/')) : '';
    if (!cleanPath) {
      return { fullPath: baseFilePath, anchorId: anchor };
    }
    const combined = baseDir ? `${baseDir}/${cleanPath}` : cleanPath;
    const parts = combined.replace(/\\/g, '/').split('/');
    const stack: string[] = [];
    for (const p of parts) {
      if (p === '.' || p === '') continue;
      if (p === '..') stack.pop();
      else stack.push(p);
    }
    return { fullPath: stack.join('/'), anchorId: anchor };
  },

  generateFallbackToc(segments: Segment[]): TocItem[] {
    const fallbackItems: TocItem[] = [];
    const seenFiles = new Set<string>();

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const headingMatch = seg.originalHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
      if (headingMatch && headingMatch[1].trim()) {
        const cleanTitle = headingMatch[1].replace(/<[^>]+>/g, '').trim();
        if (cleanTitle.length > 0 && cleanTitle.length < 120) {
          fallbackItems.push({
            id: `gen-head-${fallbackItems.length + 1}`,
            title: cleanTitle,
            href: seg.fileHref,
            fileHref: seg.fileHref,
            level: 1,
            segmentIndex: i,
          });
          seenFiles.add(seg.fileHref);
          continue;
        }
      }

      if (!seenFiles.has(seg.fileHref)) {
        seenFiles.add(seg.fileHref);
        const fileName = seg.fileHref.split('/').pop()?.replace(/\.[^.]+$/, '') || `Section ${seenFiles.size}`;
        const formattedTitle = fileName.replace(/[_-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        fallbackItems.push({
          id: `gen-file-${fallbackItems.length + 1}`,
          title: formattedTitle,
          href: seg.fileHref,
          fileHref: seg.fileHref,
          level: 1,
          segmentIndex: i,
        });
      }
    }

    return fallbackItems;
  },

  async extractTocFromBlob(file: Blob, segments: Segment[]): Promise<TocItem[]> {
    try {
      const zip = await new JSZip().loadAsync(file);
      const containerXml = await zip.file("META-INF/container.xml")?.async("string");
      if (!containerXml) {
        return this.generateFallbackToc(segments);
      }
      const parser = new DOMParser();
      const containerDoc = parser.parseFromString(containerXml, "application/xml");
      const rootfile = containerDoc.getElementsByTagName("rootfile")[0] || containerDoc.getElementsByTagNameNS("*", "rootfile")[0];
      const opfPath = rootfile?.getAttribute("full-path");
      if (!opfPath) {
        return this.generateFallbackToc(segments);
      }
      const opfContent = await zip.file(opfPath)?.async("string");
      if (!opfContent) {
        return this.generateFallbackToc(segments);
      }
      const opfDoc = parser.parseFromString(opfContent, "application/xml");
      const manifest = opfDoc.getElementsByTagName('manifest')[0] || opfDoc.getElementsByTagNameNS('*', 'manifest')[0];
      const manifestItems = Array.from(manifest?.getElementsByTagName('item') || []);
      if (manifestItems.length === 0 && manifest) {
        manifestItems.push(...Array.from(manifest.getElementsByTagNameNS('*', 'item')));
      }

      return await this.extractToc(zip, opfDoc, opfPath, manifestItems, segments);
    } catch (e) {
      console.warn("Failed to extract TOC from blob, falling back to headings:", e);
      return this.generateFallbackToc(segments);
    }
  },

  async extractToc(
    zip: JSZip,
    opfDoc: Document,
    opfPath: string,
    manifestItems: Element[],
    segments: Segment[]
  ): Promise<TocItem[]> {
    const parser = new DOMParser();

    const findSegmentIndex = (fileHref: string, anchorId?: string, itemTitle?: string): number => {
      const normTarget = normalizeZipPath(fileHref);
      const targetFileName = normTarget.split('/').pop() || '';

      // 1. Try exact normalized path match
      const exactMatches: number[] = [];
      const suffixMatches: number[] = [];

      for (let i = 0; i < segments.length; i++) {
        const normSeg = normalizeZipPath(segments[i].fileHref);
        if (normSeg === normTarget) {
          exactMatches.push(i);
        } else if (normSeg.endsWith(normTarget) || normTarget.endsWith(normSeg) || (targetFileName && normSeg.split('/').pop() === targetFileName)) {
          suffixMatches.push(i);
        }
      }

      const matchingIndices = exactMatches.length > 0 ? exactMatches : suffixMatches;

      // 2. Anchor matching within matching file segments (or all segments if matchingIndices is empty)
      if (anchorId) {
        const cleanAnchor = anchorId.replace(/^#/, '').trim();
        const escapedAnchor = cleanAnchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:id|name)=["']?\\s*${escapedAnchor}\\b["']?`, 'i');

        const searchPool = matchingIndices.length > 0 ? matchingIndices : Array.from({ length: segments.length }, (_, k) => k);
        for (const idx of searchPool) {
          if (regex.test(segments[idx].originalHtml)) {
            return idx;
          }
        }
      }

      if (matchingIndices.length > 0) {
        return matchingIndices[0];
      }

      // 3. Fallback: match by title text in segment HTML
      if (itemTitle && itemTitle.trim().length > 2) {
        const cleanTitle = itemTitle.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/gi, '');
        if (cleanTitle.length > 2) {
          for (let i = 0; i < segments.length; i++) {
            const textOnly = segments[i].originalHtml.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/gi, '');
            if (textOnly.includes(cleanTitle)) {
              return i;
            }
          }
        }
      }

      return 0;
    };

    // 1. Try EPUB 3 Navigation Document
    const navItem = manifestItems.find(item => {
      const props = item.getAttribute('properties') || '';
      return props.split(/\s+/).includes('nav');
    });

    if (navItem) {
      const href = navItem.getAttribute('href');
      if (href) {
        const resolved = this.resolveZipHref(opfPath, href);
        const navContent = await zip.file(resolved.fullPath)?.async('string');
        if (navContent) {
          const navDoc = parser.parseFromString(navContent, 'application/xhtml+xml');
          const navElements = Array.from(navDoc.getElementsByTagNameNS('*', 'nav')).concat(
            Array.from(navDoc.getElementsByTagName('nav'))
          );
          const navEl = navElements.find(el => {
            const epubType = el.getAttribute('epub:type') || el.getAttributeNS('http://www.idpf.org/2007/ops', 'type');
            const role = el.getAttribute('role');
            const id = el.getAttribute('id');
            return epubType === 'toc' || role === 'doc-toc' || id === 'toc';
          }) || navElements[0];

          if (navEl) {
            const listEl = navEl.getElementsByTagName('ol')[0] || 
                           navEl.getElementsByTagNameNS('*', 'ol')[0] ||
                           navEl.getElementsByTagName('ul')[0] ||
                           navEl.getElementsByTagNameNS('*', 'ul')[0];
            if (listEl) {
              const parseNavList = (parent: Element, level: number = 1): TocItem[] => {
                const results: TocItem[] = [];
                const childLis = Array.from(parent.children).filter(el => el.localName === 'li');
                for (const li of childLis) {
                  const links = Array.from(li.getElementsByTagNameNS('*', 'a')).concat(
                    Array.from(li.getElementsByTagName('a'))
                  );
                  const link = links[0];
                  if (!link) continue;
                  const itemHref = link.getAttribute('href') || '';
                  const itemTitle = link.textContent?.trim() || 'Untitled Section';
                  const itemResolved = this.resolveZipHref(resolved.fullPath, itemHref);
                  const segIdx = findSegmentIndex(itemResolved.fullPath, itemResolved.anchorId, itemTitle);

                  const tocItem: TocItem = {
                    id: `nav-${results.length + 1}-${level}-${Math.random().toString(36).substr(2, 6)}`,
                    title: itemTitle,
                    href: itemHref,
                    fileHref: itemResolved.fullPath,
                    anchorId: itemResolved.anchorId,
                    level,
                    segmentIndex: segIdx,
                  };

                  const subLists = Array.from(li.children).filter(el => el.localName === 'ol' || el.localName === 'ul');
                  if (subLists.length > 0) {
                    tocItem.subItems = parseNavList(subLists[0], level + 1);
                  }
                  results.push(tocItem);
                }
                return results;
              };

              const items = parseNavList(listEl, 1);
              if (items.length > 0) return items;
            }
          }
        }
      }
    }

    // 2. Try EPUB 2 NCX Document
    const ncxItem = manifestItems.find(item => {
      const mediaType = item.getAttribute('media-type') || '';
      const id = item.getAttribute('id')?.toLowerCase() || '';
      return mediaType === 'application/x-dtbncx+xml' || id === 'ncx';
    });

    if (ncxItem) {
      const href = ncxItem.getAttribute('href');
      if (href) {
        const resolved = this.resolveZipHref(opfPath, href);
        const ncxContent = await zip.file(resolved.fullPath)?.async('string');
        if (ncxContent) {
          const ncxDoc = parser.parseFromString(ncxContent, 'application/xml');
          const navMap = ncxDoc.getElementsByTagNameNS('*', 'navMap')[0] || ncxDoc.getElementsByTagName('navMap')[0];
          if (navMap) {
            const parseNcx = (parent: Element, level: number = 1): TocItem[] => {
              const results: TocItem[] = [];
              const points = Array.from(parent.children).filter(el => el.localName === 'navPoint' || el.tagName.toLowerCase() === 'navpoint');
              for (const np of points) {
                const id = np.getAttribute('id') || `np-${results.length + 1}`;
                const labelEl = np.getElementsByTagNameNS('*', 'text')[0] || np.getElementsByTagName('text')[0];
                const itemTitle = labelEl?.textContent?.trim() || 'Untitled Section';
                const contentEl = np.getElementsByTagNameNS('*', 'content')[0] || np.getElementsByTagName('content')[0];
                const itemSrc = contentEl?.getAttribute('src') || '';
                const itemResolved = this.resolveZipHref(resolved.fullPath, itemSrc);
                const segIdx = findSegmentIndex(itemResolved.fullPath, itemResolved.anchorId, itemTitle);

                const tocItem: TocItem = {
                  id: `ncx-${id}`,
                  title: itemTitle,
                  href: itemSrc,
                  fileHref: itemResolved.fullPath,
                  anchorId: itemResolved.anchorId,
                  level,
                  segmentIndex: segIdx,
                };

                const nested = parseNcx(np, level + 1);
                if (nested.length > 0) {
                  tocItem.subItems = nested;
                }
                results.push(tocItem);
              }
              return results;
            };

            const items = parseNcx(navMap, 1);
            if (items.length > 0) return items;
          }
        }
      }
    }

    // 3. Fallback: Auto-generate TOC from headings or spine files
    return this.generateFallbackToc(segments);
  },

  async updateTocOnExport(
    zip: JSZip,
    opfPath: string,
    opfDoc: Document,
    options?: {
      arabicTitle?: string;
      originalTitle?: string;
      toc?: TocItem[];
    }
  ): Promise<void> {
    if (!options?.toc || options.toc.length === 0) return;

    const flattenToc = (items: TocItem[]): TocItem[] => {
      const res: TocItem[] = [];
      for (const it of items) {
        res.push(it);
        if (it.subItems && it.subItems.length > 0) {
          res.push(...flattenToc(it.subItems));
        }
      }
      return res;
    };

    const flatToc = flattenToc(options.toc);
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';
    const manifest = opfDoc.getElementsByTagName('manifest')[0] || opfDoc.getElementsByTagNameNS('*', 'manifest')[0];
    const spine = opfDoc.getElementsByTagName('spine')[0] || opfDoc.getElementsByTagNameNS('*', 'spine')[0];
    const manifestItems = Array.from(manifest?.getElementsByTagName('item') || []);
    if (manifestItems.length === 0 && manifest) {
      manifestItems.push(...Array.from(manifest.getElementsByTagNameNS('*', 'item')));
    }

    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    // Helper to find matching TocItem for a given href
    const findMatchingTocItem = (baseDocPath: string, rawHref: string): TocItem | undefined => {
      if (!rawHref) return undefined;
      const resolved = this.resolveZipHref(baseDocPath, rawHref);
      const normResolved = normalizeZipPath(resolved.fullPath);
      const resolvedFileName = normResolved.split('/').pop() || '';
      const resolvedAnchor = (resolved.anchorId || '').replace(/^#/, '').toLowerCase();

      return flatToc.find(t => {
        if (t.href === rawHref) return true;
        const normTocFile = normalizeZipPath(t.fileHref);
        const tocFileName = normTocFile.split('/').pop() || '';
        const tocAnchor = (t.anchorId || '').replace(/^#/, '').toLowerCase();

        const fileMatches = (normTocFile === normResolved) || 
                            (normTocFile.endsWith(normResolved) || normResolved.endsWith(normTocFile)) || 
                            (resolvedFileName && tocFileName === resolvedFileName);

        if (fileMatches) {
          if (tocAnchor && resolvedAnchor) return tocAnchor === resolvedAnchor;
          if (!resolvedAnchor) return true;
        }
        return false;
      });
    };

    // 1. Update EPUB 3 Navigation Document if present
    const navItem = manifestItems.find(item => {
      const props = item.getAttribute('properties') || '';
      return props.split(/\s+/).includes('nav');
    });

    let navUpdated = false;

    if (navItem) {
      const href = navItem.getAttribute('href');
      if (href) {
        const navPath = opfDir ? `${opfDir}/${href}` : href;
        const navContent = await zip.file(navPath)?.async('string');
        if (navContent) {
          const navDoc = parser.parseFromString(navContent, 'application/xhtml+xml');
          
          if (navDoc.documentElement) {
            navDoc.documentElement.setAttribute('dir', 'rtl');
            navDoc.documentElement.setAttribute('lang', 'ar');
            navDoc.documentElement.setAttribute('xml:lang', 'ar');
          }
          if (navDoc.body) {
            navDoc.body.setAttribute('dir', 'rtl');
          }

          const navElements = Array.from(navDoc.getElementsByTagNameNS('*', 'nav')).concat(
            Array.from(navDoc.getElementsByTagName('nav'))
          );
          for (const navEl of navElements) {
            navEl.setAttribute('dir', 'rtl');
          }

          const titleEl = navDoc.getElementsByTagNameNS('*', 'title')[0] || navDoc.getElementsByTagName('title')[0];
          if (titleEl && options.arabicTitle) {
            titleEl.textContent = options.arabicTitle;
          }

          const allLinks = Array.from(navDoc.getElementsByTagNameNS('*', 'a')).concat(
            Array.from(navDoc.getElementsByTagName('a'))
          );
          const links = Array.from(new Set(allLinks));

          for (const a of links) {
            const rawHref = a.getAttribute('href');
            if (!rawHref) continue;
            const match = findMatchingTocItem(navPath, rawHref);

            if (match && match.arabicTitle) {
              a.textContent = match.arabicTitle;
            }
          }

          zip.file(navPath, serializer.serializeToString(navDoc));
          navUpdated = true;
        }
      }
    }

    // 2. Update EPUB 2 NCX Document if present
    const ncxItem = manifestItems.find(item => {
      const mediaType = item.getAttribute('media-type') || '';
      const id = item.getAttribute('id')?.toLowerCase() || '';
      return mediaType === 'application/x-dtbncx+xml' || id === 'ncx';
    });

    let ncxUpdated = false;

    if (ncxItem) {
      const href = ncxItem.getAttribute('href');
      if (href) {
        const ncxPath = opfDir ? `${opfDir}/${href}` : href;
        const ncxContent = await zip.file(ncxPath)?.async('string');
        if (ncxContent) {
          const ncxDoc = parser.parseFromString(ncxContent, 'application/xml');

          const docTitle = ncxDoc.getElementsByTagNameNS('*', 'docTitle')[0] || ncxDoc.getElementsByTagName('docTitle')[0];
          if (docTitle && options.arabicTitle) {
            let textEl = docTitle.getElementsByTagNameNS('*', 'text')[0] || docTitle.getElementsByTagName('text')[0];
            if (!textEl) {
              textEl = ncxDoc.createElement('text');
              docTitle.appendChild(textEl);
            }
            textEl.textContent = options.arabicTitle;
          }

          const navPoints = Array.from(ncxDoc.getElementsByTagNameNS('*', 'navPoint')).concat(
            Array.from(ncxDoc.getElementsByTagName('navPoint'))
          );
          const uniqueNavPoints = Array.from(new Set(navPoints));

          for (const np of uniqueNavPoints) {
            const contentEl = np.getElementsByTagNameNS('*', 'content')[0] || np.getElementsByTagName('content')[0];
            const src = contentEl?.getAttribute('src');
            if (!src) continue;
            const match = findMatchingTocItem(ncxPath, src);

            if (match && match.arabicTitle) {
              let labelEl = np.getElementsByTagNameNS('*', 'navLabel')[0] || np.getElementsByTagName('navLabel')[0];
              if (!labelEl) {
                labelEl = ncxDoc.createElement('navLabel');
                np.insertBefore(labelEl, contentEl);
              }
              let textEl = labelEl.getElementsByTagNameNS('*', 'text')[0] || labelEl.getElementsByTagName('text')[0];
              if (!textEl) {
                textEl = ncxDoc.createElement('text');
                labelEl.appendChild(textEl);
              }
              textEl.textContent = match.arabicTitle;
            }
          }

          zip.file(ncxPath, serializer.serializeToString(ncxDoc));
          ncxUpdated = true;
        }
      }
    }

    // 3. If neither NAV nor NCX was present in original EPUB, synthesize both for full reader support
    if (!navUpdated) {
      const navFileName = 'nav.xhtml';
      const navRelHref = navFileName;
      const navFullPath = opfDir ? `${opfDir}/${navFileName}` : navFileName;

      const renderNavItems = (items: TocItem[]): string => {
        let html = '<ol>\n';
        for (const it of items) {
          const title = it.arabicTitle || it.title;
          const targetRel = it.href;
          html += `  <li><a href="${targetRel}">${title}</a>`;
          if (it.subItems && it.subItems.length > 0) {
            html += '\n' + renderNavItems(it.subItems);
          }
          html += '</li>\n';
        }
        html += '</ol>';
        return html;
      };

      const navHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ar" xml:lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${options.arabicTitle || 'فهرس المحتويات'}</title>
  <style>
    body { direction: rtl; font-family: sans-serif; padding: 2rem; }
    nav ol { list-style-type: decimal; padding-right: 1.5rem; }
    nav li { margin-bottom: 0.5rem; }
    nav a { text-decoration: none; color: #0284c7; }
  </style>
</head>
<body dir="rtl">
  <nav epub:type="toc" id="toc" role="doc-toc" dir="rtl">
    <h1>فهرس المحتويات</h1>
    ${renderNavItems(options.toc)}
  </nav>
</body>
</html>`;

      zip.file(navFullPath, navHtml);

      if (manifest) {
        const item = opfDoc.createElement('item');
        item.setAttribute('id', 'nav');
        item.setAttribute('href', navRelHref);
        item.setAttribute('properties', 'nav');
        item.setAttribute('media-type', 'application/xhtml+xml');
        manifest.appendChild(item);
      }
    }

    if (!ncxUpdated) {
      const ncxFileName = 'toc.ncx';
      const ncxRelHref = ncxFileName;
      const ncxFullPath = opfDir ? `${opfDir}/${ncxFileName}` : ncxFileName;

      let playOrder = 1;
      const renderNcxPoints = (items: TocItem[]): string => {
        let xml = '';
        for (const it of items) {
          const currentOrder = playOrder++;
          const title = it.arabicTitle || it.title;
          xml += `<navPoint id="navPoint-${currentOrder}" playOrder="${currentOrder}">\n`;
          xml += `  <navLabel><text>${title}</text></navLabel>\n`;
          xml += `  <content src="${it.href}"/>\n`;
          if (it.subItems && it.subItems.length > 0) {
            xml += renderNcxPoints(it.subItems);
          }
          xml += `</navPoint>\n`;
        }
        return xml;
      };

      const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:mutarjim-arabic-toc" />
    <meta name="dtb:depth" content="2" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle>
    <text>${options.arabicTitle || 'فهرس الكتاب'}</text>
  </docTitle>
  <navMap>
    ${renderNcxPoints(options.toc)}
  </navMap>
</ncx>`;

      zip.file(ncxFullPath, ncxXml);

      if (manifest) {
        const item = opfDoc.createElement('item');
        item.setAttribute('id', 'ncx');
        item.setAttribute('href', ncxRelHref);
        item.setAttribute('media-type', 'application/x-dtbncx+xml');
        manifest.appendChild(item);
      }
      if (spine && !spine.getAttribute('toc')) {
        spine.setAttribute('toc', 'ncx');
      }
    }
  }
};
