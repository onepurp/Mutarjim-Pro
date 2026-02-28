import { GoogleGenAI, Type } from "@google/genai";
import { ArchitectAnalysisResult, TypographyProfile } from "../types";

// System instruction for the EPUB Expert persona
const SYSTEM_INSTRUCTION = `
You are an expert Digital Publishing Architect and Typography Specialist.
Your task is to analyze EPUB fragments to diagnose issues and recommend improvements.
You have a deep understanding of book design, typography psychology, and EPUB3 standards.
When choosing fonts and spacing, you consider the book's genre, mood, and era (the "Book Personality").
`;

export const analyzeEpubStructure = async (
  opfContent: string,
  cssSample: string,
  htmlSample: string,
  fileName: string
): Promise<ArchitectAnalysisResult> => {
  const model = "gemini-3.1-pro-preview"; 
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  const prompt = `
  Analyze the provided 'content.opf', CSS sample, and HTML text sample.
  
  File Name: ${fileName}

  Task:
  1. Extract metadata.
  2. Identify structural errors.
  3. Determine the "Book Personality" (e.g., "19th Century Fiction", "Modern Technical Manual", "Playful Children's Book", "Islamic Theology") based on the title, description, and file name.
  4. CRITICAL: Detect the ACTUAL language of the book by looking at the HTML Text Sample. Do NOT blindly trust the <dc:language> tag in the OPF, as it may be incorrect if the book was translated but the metadata wasn't updated.
  5. Based on the Personality and DETECTED Language, recommend specific, high-quality Google Fonts.
  6. Recommend a 'Typography Profile' (spacing, margins, visual rhythm) that suits the book's personality. 
     - E.g., Dense classic books usually have smaller line-height and indented paragraphs. 
     - Modern non-fiction usually has generous line-height and block spacing between paragraphs.
  
  Return a strictly formatted JSON object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { text: prompt },
          { text: `--- content.opf ---\n${opfContent}` },
          { text: `--- style.css sample ---\n${cssSample}` },
          { text: `--- HTML Text Sample ---\n${htmlSample}` }
        ]
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            metadata: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                creator: { type: Type.STRING },
                language: { type: Type.STRING },
                identifier: { type: Type.STRING },
                publisher: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["title", "creator", "language"],
            },
            bookPersonality: { type: Type.STRING },
            issues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["CRITICAL", "WARNING", "INFO"] },
                  category: { type: Type.STRING, enum: ["METADATA", "STRUCTURE", "CSS", "COMPATIBILITY", "TOC"] },
                  description: { type: Type.STRING },
                  recommendation: { type: Type.STRING },
                  autoFixable: { type: Type.BOOLEAN },
                },
                required: ["id", "type", "category", "description", "recommendation", "autoFixable"]
              },
            },
            isRTL: { type: Type.BOOLEAN },
            fontRecommendations: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        role: { type: Type.STRING, enum: ['body', 'heading', 'subheading', 'quote', 'code'] },
                        fontFamily: { type: Type.STRING },
                        kebabName: { type: Type.STRING },
                        category: { type: Type.STRING, enum: ['serif', 'sans-serif', 'display', 'monospace', 'handwriting'] },
                        subset: { type: Type.STRING },
                        justification: { type: Type.STRING }
                    },
                    required: ['role', 'fontFamily', 'kebabName', 'category', 'subset', 'justification']
                }
            },
            typographyProfile: {
                type: Type.OBJECT,
                properties: {
                    themeName: { type: Type.STRING },
                    lineHeight: { type: Type.STRING },
                    paragraphSpacing: { type: Type.STRING },
                    headingTopMargin: { type: Type.STRING },
                    headingBottomMargin: { type: Type.STRING },
                    maxWidth: { type: Type.STRING },
                    baseFontSize: { type: Type.STRING }
                },
                required: ['themeName', 'lineHeight', 'paragraphSpacing', 'headingTopMargin', 'headingBottomMargin', 'maxWidth', 'baseFontSize']
            }
          },
          required: ["metadata", "issues", "isRTL", "fontRecommendations", "bookPersonality", "typographyProfile"],
        }
      }
    });

    if (!response.text) throw new Error("Empty response from AI");

    const data = JSON.parse(response.text);

    return {
      metadata: data.metadata,
      issues: data.issues,
      manifestCount: 0, 
      cssFileCount: 0, 
      originalSize: 0, 
      detectedLanguage: data.metadata.language || 'en',
      isRTL: data.isRTL,
      bookPersonality: data.bookPersonality || "General",
      tocStatus: { exists: false, path: '', brokenLinks: 0, type: 'NONE' },
      fontRecommendations: data.fontRecommendations,
      typographyProfile: data.typographyProfile
    };

  } catch (error) {
    console.error("AI Analysis Failed:", error);
    return {
        metadata: { title: "Unknown", creator: "Unknown", language: "en", identifier: "" },
        issues: [{
            id: "ai_fail",
            type: "WARNING",
            category: "STRUCTURE",
            description: "AI Analysis service unavailable. Running local checks only.",
            recommendation: "Proceed with caution.",
            autoFixable: false
        }],
        manifestCount: 0,
        cssFileCount: 0,
        originalSize: 0,
        detectedLanguage: "en",
        isRTL: false,
        bookPersonality: "Unknown",
        tocStatus: { exists: false, path: '', brokenLinks: 0, type: 'NONE' },
        fontRecommendations: [
            { role: 'body', fontFamily: 'Merriweather', kebabName: 'merriweather', category: 'serif', subset: 'latin', justification: 'Fallback' },
            { role: 'heading', fontFamily: 'Merriweather', kebabName: 'merriweather', category: 'serif', subset: 'latin', justification: 'Fallback' }
        ],
        typographyProfile: {
            themeName: "Fallback Standard",
            lineHeight: "1.6",
            paragraphSpacing: "1em",
            headingTopMargin: "1.5em",
            headingBottomMargin: "0.5em",
            maxWidth: "65ch",
            baseFontSize: "1em"
        }
    };
  }
};

export const generateStandardizedCSS = async (
    originalCSS: string, 
    isRTL: boolean, 
    fontMap?: Record<string, string>, // maps role (body, heading) to Font Family Name
    typographyProfile?: TypographyProfile
): Promise<string> => {
    const model = "gemini-3.1-pro-preview"; 
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    
    let prompt = `Refactor the following CSS for an EPUB to be strictly EPUB3 compliant and visually enhanced.
            
            1. COMPLIANCE & CLEANUP:
            - Convert fixed pixels (px) to relative units (em/rem).
            - Ensure max-width on images is 100%.
            - Remove absolute positioning or fixed widths that break flow.
            - ${isRTL ? 'Ensure proper direction: rtl; and text-align properties.' : ''}
            
            2. VISUAL ENHANCEMENT (Crucial):`;

    if (typographyProfile) {
        prompt += `
            - IMPLEMENT the following Typography Profile ("${typographyProfile.themeName}"):
              - Body Text: line-height: ${typographyProfile.lineHeight}; font-size: ${typographyProfile.baseFontSize};
              - Paragraphs: Ensure consistent spacing. Use margin-bottom: ${typographyProfile.paragraphSpacing};
              - Headings (h1-h6): 
                 - margin-top: ${typographyProfile.headingTopMargin};
                 - margin-bottom: ${typographyProfile.headingBottomMargin};
                 - line-height: 1.2;
              - Container: Restrict max-width to ${typographyProfile.maxWidth} (and center it) on body/container to prevent extremely long lines on large screens.
        `;
    }

    if (fontMap) {
        prompt += `
            3. FONT APPLICATION:
            - Apply '${fontMap['body']}' to body, p, div, span.
            - Apply '${fontMap['heading']}' to h1, h2, h3, h4, h5, h6.
            ${fontMap['quote'] ? `- Apply '${fontMap['quote']}' to blockquote, q, .quote.` : ''}
            ${fontMap['code'] ? `- Apply '${fontMap['code']}' to pre, code, kbd, samp.` : ''}
            - Do NOT add @font-face rules (they are already handled). Use the font names directly.`;
    }

    prompt += `
            - Output ONLY the raw CSS string.
            
            CSS Input:
            ${originalCSS.substring(0, 15000)}`;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt
        });
        return response.text || originalCSS;
    } catch (e) {
        console.error("CSS Generation failed", e);
        return originalCSS;
    }
}

export const standardizeNavDoc = async (navContent: string, isRTL: boolean): Promise<string> => {
  const model = "gemini-3.1-pro-preview";
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Refactor the following EPUB Navigation Document (XHTML).
      - Ensure <nav epub:type="toc"> exists.
      - Use ordered list <ol>.
      - Preserve href attributes exactly.
      - ${isRTL ? 'Set dir="rtl" on html tag.' : ''}
      - Return ONLY HTML.
      
      Input:
      ${navContent.substring(0, 15000)}`
    });
    return response.text || navContent;
  } catch (e) {
    return navContent;
  }
};
