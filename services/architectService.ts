import JSZip from 'jszip';
import { ArchitectAnalysisResult, ProcessingLog, RepairActions, FontRecommendation } from '../types';
import { analyzeEpubStructure, generateStandardizedCSS, standardizeNavDoc } from './architectAiService';
import { downloadFontFamily, generateFontFaceCSS, FontAsset } from './fontService';

export class EpubProcessor {
  private zip: JSZip | null = null;
  private opfPath: string = '';
  private opfContent: string = '';
  private cssPaths: string[] = [];
  private tocPath: string = '';
  private tocType: 'NCX' | 'NAV' | 'NONE' = 'NONE';
  private missingPages: string[] = []; 
  private analysisResult: ArchitectAnalysisResult | null = null;
  
  constructor(private logCallback: (log: ProcessingLog) => void) {}

  private log(message: string, type: 'info' | 'success' | 'error' = 'info') {
    this.logCallback({ timestamp: Date.now(), message, type });
  }

  async loadFile(file: File | Blob, fileName: string): Promise<void> {
    this.log(`Loading file: ${fileName} ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    try {
      this.zip = await JSZip.loadAsync(file);
      this.log("File decompressed successfully.", 'success');
    } catch (e) {
      this.log("Failed to load ZIP file. Is it a valid EPUB?", 'error');
      throw e;
    }
  }

  private resolvePath(basePath: string, relativePath: string): string {
    try { relativePath = decodeURIComponent(relativePath); } catch (e) {}
    const stack = basePath.split('/');
    stack.pop(); 
    const parts = relativePath.split('/');
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    return stack.join('/');
  }

  private getRelativeHref(fromOpfPath: string, toFilePath: string): string {
    const fromParts = fromOpfPath.split('/');
    fromParts.pop(); 
    const toParts = toFilePath.split('/');
    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
    const up = fromParts.length - i;
    const down = toParts.slice(i);
    let href = "";
    for (let j = 0; j < up; j++) href += "../";
    href += down.join("/");
    return href; 
  }

  async analyze(fileName: string, segments?: import('../types').Segment[]): Promise<ArchitectAnalysisResult> {
    if (!this.zip) throw new Error("No file loaded");

    this.log("Locating META-INF/container.xml...");
    const containerXml = await this.zip.file("META-INF/container.xml")?.async("string");
    if (!containerXml) throw new Error("Invalid EPUB: Missing container.xml");

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "application/xml");
    const rootfile = containerDoc.querySelector("rootfile");
    this.opfPath = rootfile?.getAttribute("full-path") || "";
    if (!this.opfPath) throw new Error("Cannot find OPF path in container.xml");
    
    this.opfContent = await this.zip.file(this.opfPath)?.async("string") || "";
    if (!this.opfContent) throw new Error("OPF file is empty or missing");

    const opfDoc = parser.parseFromString(this.opfContent, "application/xml");

    this.cssPaths = [];
    this.zip.forEach((relativePath, file) => {
      if (relativePath.endsWith(".css")) this.cssPaths.push(relativePath);
    });

    this.missingPages = [];
    const manifestZipPaths = new Set<string>();
    const manifestItems = opfDoc.querySelectorAll('manifest > item');
    manifestItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href) manifestZipPaths.add(this.resolvePath(this.opfPath, href));
    });

    this.zip.forEach((relativePath, file) => {
        if (!file.dir && /\.(x?html|htm)$/i.test(relativePath)) {
            if (!manifestZipPaths.has(relativePath)) {
                if (!relativePath.startsWith('META-INF/') && !relativePath.includes('__MACOSX')) {
                    this.missingPages.push(relativePath);
                }
            }
        }
    });

    this.tocPath = '';
    this.tocType = 'NONE';
    let brokenLinks = 0;

    const navItem = opfDoc.querySelector('item[properties~="nav"]');
    if (navItem) {
      this.tocType = 'NAV';
      const href = navItem.getAttribute('href');
      if (href) this.tocPath = this.resolvePath(this.opfPath, href);
    } else {
      const ncxItem = opfDoc.querySelector('item[media-type="application/x-dtbncx+xml"]');
      if (ncxItem) {
        this.tocType = 'NCX';
        const href = ncxItem.getAttribute('href');
        if (href) this.tocPath = this.resolvePath(this.opfPath, href);
      }
    }

    if (this.tocPath && this.zip.file(this.tocPath)) {
        const tocContent = await this.zip.file(this.tocPath)?.async("string") || "";
        const tocDoc = parser.parseFromString(tocContent, "application/xml");
        let links: string[] = [];
        if (this.tocType === 'NAV') {
            tocDoc.querySelectorAll('a[href]').forEach(a => links.push(a.getAttribute('href') || ''));
        } else if (this.tocType === 'NCX') {
            tocDoc.querySelectorAll('content').forEach(c => links.push(c.getAttribute('src') || ''));
        }
        for (const link of links) {
            const pureLink = link.split('#')[0]; 
            const resolvedLink = this.resolvePath(this.tocPath, pureLink);
            if (!this.zip.file(resolvedLink)) brokenLinks++;
        }
    }

    let cssSample = "";
    if (this.cssPaths.length > 0) {
      cssSample = await this.zip.file(this.cssPaths[0])?.async("string") || "";
    }

    let htmlSample = "";
    if (segments && segments.length > 0) {
        // Use translated segments if available to detect the correct target language
        const translatedSegments = segments.filter(s => s.status === 'TRANSLATED' && s.translatedHtml);
        if (translatedSegments.length > 0) {
            htmlSample = translatedSegments.slice(0, 10).map(s => s.translatedHtml).join(' ').replace(/<[^>]+>/g, ' ').substring(0, 2000);
        }
    }
    
    if (!htmlSample) {
        // Fallback to original EPUB content if no translations exist
        for (const path of manifestZipPaths) {
            if (/\.(x?html|htm)$/i.test(path)) {
                const content = await this.zip.file(path)?.async("string");
                if (content && content.length > 500) {
                    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                    if (bodyMatch) {
                        htmlSample = bodyMatch[1].replace(/<[^>]+>/g, ' ').substring(0, 2000);
                        break;
                    }
                }
            }
        }
    }

    this.log("Sending metadata and structure to AI Analyst...");
    const aiResult = await analyzeEpubStructure(this.opfContent, cssSample, htmlSample, fileName);
    this.analysisResult = aiResult;

    aiResult.manifestCount = (this.opfContent.match(/<item /g) || []).length;
    aiResult.cssFileCount = this.cssPaths.length;
    aiResult.tocStatus = {
        exists: !!this.tocPath,
        path: this.tocPath,
        brokenLinks: brokenLinks,
        type: this.tocType
    };

    if (brokenLinks > 0) {
        aiResult.issues.push({
            id: 'toc-broken-links',
            type: 'WARNING',
            category: 'TOC',
            description: `Found ${brokenLinks} broken links in TOC.`,
            recommendation: 'Fix links.',
            autoFixable: true
        });
    }

    if (!this.tocPath) {
        aiResult.issues.push({
            id: 'toc-missing',
            type: 'CRITICAL',
            category: 'TOC',
            description: 'No Table of Contents found.',
            recommendation: 'Generate TOC.',
            autoFixable: false
        });
    }

    if (this.missingPages.length > 0) {
        aiResult.issues.push({
            id: 'missing-pages',
            type: 'CRITICAL',
            category: 'STRUCTURE',
            description: `Found ${this.missingPages.length} ghost pages.`,
            recommendation: 'Restore missing pages.',
            autoFixable: true
        });
    }

    this.log("AI Analysis complete.", 'success');
    return aiResult;
  }

  async repair(actions: RepairActions, isRTL: boolean): Promise<Blob> {
    if (!this.zip) throw new Error("No file loaded");
    this.log("Starting repair process...");

    // Store downloaded font assets
    let embeddedFonts: FontAsset[] = [];
    const fontRoleMap: Record<string, string> = {}; // role -> familyName

    // --- DYNAMIC FONT EMBEDDING ---
    if (actions.embedFonts && this.analysisResult?.fontRecommendations) {
        this.log("Acquiring fonts based on Book Personality...");
        const recommendations = this.analysisResult.fontRecommendations;
        
        for (const rec of recommendations) {
            try {
                this.log(`Fetching ${rec.fontFamily} (${rec.subset}) for ${rec.role}...`);
                const assets = await downloadFontFamily(rec.kebabName, rec.fontFamily, rec.subset, rec.role as any);
                
                if (assets.length > 0) {
                    embeddedFonts = [...embeddedFonts, ...assets];
                    fontRoleMap[rec.role] = rec.fontFamily;
                    this.log(`  - Downloaded ${assets.length} variants for ${rec.fontFamily}`);
                } else {
                    this.log(`  - Failed to fetch ${rec.fontFamily}, skipping.`);
                }
            } catch (e) {
                console.warn(`Error processing font ${rec.fontFamily}`, e);
            }
        }

        if (embeddedFonts.length > 0) {
            // Save to ZIP
            const fontDir = "fonts/";
            const opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf('/') + 1);
            const fontsPathInZip = opfDir + fontDir;

            const parser = new DOMParser();
            const doc = parser.parseFromString(this.opfContent, "application/xml");
            const manifest = doc.querySelector("manifest");

            for (const font of embeddedFonts) {
                // Write file to ZIP
                this.zip.file(fontsPathInZip + font.filename, font.buffer);

                // Add to Manifest
                const item = doc.createElementNS("http://www.idpf.org/2007/opf", "item");
                if (item) {
                    item.setAttribute('id', `font-${font.id}`);
                    item.setAttribute('href', `${fontDir}${font.filename}`);
                    item.setAttribute('media-type', 'font/woff2');
                    manifest?.appendChild(item);
                }
            }

            const serializer = new XMLSerializer();
            this.opfContent = serializer.serializeToString(doc);
            this.zip.file(this.opfPath, this.opfContent);
            this.log(`Embedded ${embeddedFonts.length} font files into the EPUB.`);
        }
    }

    // 1. Fix Metadata & Structure
    if (actions.fixMetadata || actions.fixStructure) {
      this.log("Standardizing OPF...");
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.opfContent, "application/xml");
      const manifest = doc.querySelector("manifest");
      const spine = doc.querySelector("spine");
      
      if (isRTL && spine && !spine.getAttribute("page-progression-direction")) {
            spine.setAttribute("page-progression-direction", "rtl");
      }

      if (actions.fixStructure && this.missingPages.length > 0) {
          this.log(`Restoring ${this.missingPages.length} ghost pages...`);
          this.missingPages.forEach((zipPath, index) => {
              const href = this.getRelativeHref(this.opfPath, zipPath);
              const id = `restored_${Date.now()}_${index}`;
              const item = doc.createElementNS("http://www.idpf.org/2007/opf", "item");
              if (item) {
                item.setAttribute('id', id);
                item.setAttribute('href', href);
                item.setAttribute('media-type', 'application/xhtml+xml');
                manifest?.appendChild(item);
              }
              const itemref = doc.createElementNS("http://www.idpf.org/2007/opf", "itemref");
              if (itemref) {
                 itemref.setAttribute('idref', id);
                 spine?.appendChild(itemref);
              }
          });
      }

      const serializer = new XMLSerializer();
      const newOpf = serializer.serializeToString(doc);
      this.zip.file(this.opfPath, newOpf);
      this.opfContent = newOpf; 
    }

    // 2. Standardize CSS 
    if (actions.standardizeCSS) {
      this.log("Optimizing CSS with AI...");
      for (const cssPath of this.cssPaths) {
        let cssContent = await this.zip.file(cssPath)?.async("string");
        if (cssContent) {
          // A. AI Standardization with Font Map & Typography Profile
          cssContent = await generateStandardizedCSS(
              cssContent, 
              isRTL, 
              fontRoleMap, 
              this.analysisResult?.typographyProfile
          );
          
          // B. Prepend @font-face rules
          if (embeddedFonts.length > 0) {
             const opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf('/') + 1);
             const fontsAbsPath = opfDir + "fonts/";
             const getFontRelPath = (filename: string) => this.getRelativeHref(cssPath, fontsAbsPath + filename);
             
             // Generate CSS for all fonts with correct relative paths
             const fontFaces = embeddedFonts.map(asset => `
@font-face {
    font-family: '${asset.family}';
    font-style: ${asset.style};
    font-weight: ${asset.weight};
    src: url('${getFontRelPath(asset.filename)}') format('${asset.format}');
}`).join('\n');

             cssContent = `/* Lumina Embedded Fonts */\n${fontFaces}\n\n` + cssContent;
          }

          this.zip.file(cssPath, cssContent);
          this.log(`Updated ${cssPath}`);
        }
      }
    }

    // 3. Fix TOC
    if (actions.fixTOC && this.tocPath && this.tocType === 'NAV') {
       let tocContent = await this.zip.file(this.tocPath)?.async("string") || "";
       const standardizedToc = await standardizeNavDoc(tocContent, isRTL);
       this.zip.file(this.tocPath, standardizedToc);
    }

    // 4. Missing Tags
    if (actions.addMissingTags) {
       const contentFiles: string[] = [];
       this.zip.forEach((path) => {
           if (path.endsWith(".xhtml") || path.endsWith(".html")) contentFiles.push(path);
       });
       for (const path of contentFiles) {
           let content = await this.zip.file(path)?.async("string") || "";
           if (!content.includes('xml:lang') && !content.includes('lang=')) {
                content = content.replace(/<html/i, `<html xml:lang="${isRTL ? 'ar' : 'en'}" lang="${isRTL ? 'ar' : 'en'}" dir="${isRTL ? 'rtl' : 'ltr'}"`);
                this.zip.file(path, content);
           }
       }
    }

    this.log("Repacking EPUB container...", 'info');
    const blob = await this.zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
    this.log("EPUB Rebuilt successfully.", 'success');
    return blob;
  }
}
