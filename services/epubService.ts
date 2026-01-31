import JSZip from 'jszip';
import { AnalysisResult, Segment, SegmentStatus, ProjectData } from '../types';

const BLOCK_TAGS = ['p', 'div', 'blockquote', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'aside', 'main', 'header', 'footer'];
const BREAKER_TAGS = ['img', 'hr', 'table', 'pre', 'svg', 'figure'];
const HEADER_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const BATCH_CHAR_LIMIT = 6000;

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
    // Note: Elements often have namespaces (e.g. dc:title, opf:metadata)
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
           const fileSegments = this.segmentHtml(htmlContent, fullPath);
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
    };

    return { project: projectData, segments };
  },

  segmentHtml(html: string, fileHref: string): Segment[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'application/xhtml+xml');
    return this.segmentHtmlRecursive(doc.body, fileHref);
  },

  segmentHtmlRecursive(root: Element, fileHref: string): Segment[] {
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
      // It is a block tag
      const tagName = el.tagName.toLowerCase();
      if (!BLOCK_TAGS.includes(tagName)) return false;
      
      // It has text content
      if (!el.textContent?.trim()) return false;
      
      // It does NOT have block children (it's a leaf block)
      const hasBlockChildren = Array.from(el.children).some(child => 
        BLOCK_TAGS.includes(child.tagName.toLowerCase()) || 
        BREAKER_TAGS.includes(child.tagName.toLowerCase())
      );
      return !hasBlockChildren;
    };

    const traverse = (node: Element) => {
       const tagName = node.tagName.toLowerCase();

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

       if (isTranslatableBlock(node)) {
         if (currentBatchLength + node.outerHTML.length > BATCH_CHAR_LIMIT) {
           flushBatch();
         }
         currentBatch.push(node);
         currentBatchLength += node.outerHTML.length;
         return; // Don't traverse children
       }

       // If not a leaf block, traverse children
       for (const child of Array.from(node.children)) {
         traverse(child);
       }
    };

    Array.from(root.children).forEach(traverse);
    flushBatch();

    return segments;
  },

  async reassembleEpub(originalBlob: Blob, segments: Segment[], customCoverBlob?: Blob, metadataOverrides?: { arabicTitle?: string, author?: string, originalTitle?: string }): Promise<Blob> {
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(originalBlob);
    
    // Group segments by file
    const segmentsByFile: Record<string, Segment[]> = {};
    segments.forEach(s => {
      if (!segmentsByFile[s.fileHref]) segmentsByFile[s.fileHref] = [];
      segmentsByFile[s.fileHref].push(s);
    });

    // 1. Process HTML Files
    for (const [fileHref, fileSegments] of Object.entries(segmentsByFile)) {
      fileSegments.sort((a, b) => a.batchIndex - b.batchIndex);
      
      const content = await zip.file(fileHref)?.async('string');
      if (!content) continue;

      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xhtml+xml');
      
      doc.body.setAttribute('dir', 'rtl');
      doc.body.setAttribute('lang', 'ar');
      doc.documentElement.setAttribute('lang', 'ar');

      let segmentIndex = 0;
      let currentBatchNodes: Element[] = [];

      const isTranslatableBlock = (el: Element): boolean => {
        if (!BLOCK_TAGS.includes(el.tagName.toLowerCase())) return false;
        if (!el.textContent?.trim()) return false;
        const hasBlockChildren = Array.from(el.children).some(child => 
          BLOCK_TAGS.includes(child.tagName.toLowerCase()) || 
          BREAKER_TAGS.includes(child.tagName.toLowerCase())
        );
        return !hasBlockChildren;
      };

      const traverseAndReplace = (node: Element) => {
        const tagName = node.tagName.toLowerCase();

        if (BREAKER_TAGS.includes(tagName)) {
           processBatch(); 
           return;
        }

        if (HEADER_TAGS.includes(tagName)) {
           processBatch();
           currentBatchNodes.push(node);
           processBatch();
           return;
        }

        if (isTranslatableBlock(node)) {
           const size = node.outerHTML.length;
           const currentBatchSize = currentBatchNodes.reduce((acc, n) => acc + n.outerHTML.length, 0);
           
           if (currentBatchSize + size > BATCH_CHAR_LIMIT && currentBatchNodes.length > 0) {
              processBatch();
           }
           currentBatchNodes.push(node);
           return;
        }

        for (const child of Array.from(node.children)) {
          traverseAndReplace(child);
        }
      };

      const processBatch = () => {
        if (currentBatchNodes.length === 0) return;
        
        const segment = fileSegments[segmentIndex];
        
        if (segment && segment.status === SegmentStatus.TRANSLATED) {
           const firstNode = currentBatchNodes[0];
           const parent = firstNode.parentElement;
           
           if (parent) {
             const tempDiv = doc.createElement('div');
             tempDiv.innerHTML = segment.translatedHtml;
             
             while (tempDiv.firstChild) {
               const child = tempDiv.firstChild;
               if (child.nodeType === Node.ELEMENT_NODE) {
                  (child as Element).setAttribute('dir', 'rtl');
               }
               parent.insertBefore(child, firstNode);
             }
             
             currentBatchNodes.forEach(n => {
                if (n.parentElement === parent) parent.removeChild(n);
             });
           }
        }
        segmentIndex++;
        currentBatchNodes = [];
      };

      Array.from(doc.body.children).forEach(traverseAndReplace);
      processBatch(); 

      const serializer = new XMLSerializer();
      const newHtml = serializer.serializeToString(doc);
      zip.file(fileHref, newHtml);
    }

    // 2. Handle Custom Cover
    if (customCoverBlob) {
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

               const coverItem = items.find(item => 
                 item.getAttribute('id')?.toLowerCase().includes('cover') || 
                 item.getAttribute('properties') === 'cover-image'
               );
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
           const metadata = opfDoc.getElementsByTagName('metadata')[0] || opfDoc.getElementsByTagNameNS('*', 'metadata')[0];
           if (metadata) {
             // Update Language
             let langEl = metadata.getElementsByTagName('language')[0] || metadata.getElementsByTagNameNS('*', 'language')[0];
             if (!langEl) {
               langEl = opfDoc.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:language');
               metadata.appendChild(langEl);
             }
             langEl.textContent = 'ar';
             
             // Update Title with specific format if data provided
             const titleEl = metadata.getElementsByTagName('title')[0] || metadata.getElementsByTagNameNS('*', 'title')[0];
             if (titleEl) {
                 if (metadataOverrides?.arabicTitle) {
                     // EXACT FORMAT: <arabic_title> - <author_name> (مترجم) [original title]
                     const arTitle = metadataOverrides.arabicTitle;
                     const auth = metadataOverrides.author || 'Unknown Author';
                     const origTitle = metadataOverrides.originalTitle || 'Unknown Title';
                     titleEl.textContent = `${arTitle} - ${auth} (مترجم) [${origTitle}]`;
                 } else if (titleEl.textContent && !titleEl.textContent.includes('(مترجم)')) {
                    // Fallback
                    titleEl.textContent = `(مترجم) ${titleEl.textContent}`;
                 }
             }
           }
           zip.file(opfPath, new XMLSerializer().serializeToString(opfDoc));
         }
       }
    }

    return await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  }
};