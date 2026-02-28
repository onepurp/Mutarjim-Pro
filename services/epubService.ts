
import JSZip from 'jszip';
import { AnalysisResult, Segment, SegmentStatus, ProjectData, ExportSettings } from '../types';

const BLOCK_TAGS = ['p', 'div', 'table', 'blockquote', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'aside', 'main', 'header', 'footer'];
const BREAKER_TAGS = ['img', 'hr', 'pre', 'svg', 'figure'];
const HEADER_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const BATCH_CHAR_LIMIT = 6000;
const SCHEMA_VERSION = 2; // V2 supports text nodes

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

    const projectData: ProjectData = {
      id: 'current-project',
      title,
      author: creator,
      coverUrl,
      totalSegments: segments.length,
      translatedSegments: 0,
      sourceEpubBlob: file,
      createdAt: Date.now(),
      schemaVersion: SCHEMA_VERSION
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
          exportSettings?: ExportSettings 
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

           zip.file(opfPath, new XMLSerializer().serializeToString(opfDoc));
         }
       }
    }

    return await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  },

  // ... (keep segmentHtml for interface compatibility if needed, calling V2)
  segmentHtml(html: string, fileHref: string): Segment[] {
      return this.segmentHtmlV2(html, fileHref);
  }
};
