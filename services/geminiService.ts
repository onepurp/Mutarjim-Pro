import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are an expert Arabic literary translator and editor for a prestigious publishing house, specializing in English to Arabic translation. 
Your task is to translate the provided HTML content into professional, native-sounding Arabic while strictly preserving the HTML structure.
Rules:
1. Translate the inner text of tags into modern, literary Arabic strictly following this procces: (First, Analyze the source text's tone, style, and meaning. Next, Translate the text content into Arabic. Finnaly, Refine the translation to ensure flow, correct grammar (Nahw/Sarf), and idiomatic expression.)
2. PRESERVE ALL TAGS exactly as they are. Do not add new tags. Do not delete tags, DO NOT change, remove, or reorder any HTML tags (p, div, span, etc.).
3. Do not change the nesting of tags. DO NOT translate class names, IDs, or attributes.
4. Output ONLY the HTML. Do not wrap in markdown code blocks. Return ONLY the translated HTML string. No markdown code blocks, no preamble.
5. If the text contains technical terms, keep them in English if appropriate or provide a standard Arabic equivalent.
`;

export const geminiService = {
  async translateHtml(html: string): Promise<string> {
    if (!process.env.API_KEY) {
      throw new Error("API Key is missing.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out")), 90000); // 30s timeout
      });

      const requestPromise = ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: html,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.2, // Lower temperature for more faithful translation
        }
      });

      // Race against timeout
      const response = await Promise.race([requestPromise, timeoutPromise]);

      const translatedText = response.text?.trim();
      
      if (!translatedText) {
        throw new Error("Empty response from AI");
      }

      // Cleanup: remove markdown block symbols if Gemini adds them despite instructions
      const cleanHtml = translatedText.replace(/^```html/, '').replace(/```$/, '').trim();

      if (!this.validateIntegrity(html, cleanHtml)) {
        throw new Error("Integrity Check Failed: Tag mismatch detected.");
      }

      return cleanHtml;
    } catch (error) {
      console.error("Gemini Translation Error:", error);
      throw error;
    }
  },

  validateIntegrity(original: string, translated: string): boolean {
    const getTags = (str: string) => {
      // Regex to match opening and closing tags, ignoring attributes
      return (str.match(/<\/?\w+/g) || []).sort();
    };

    const originalTags = getTags(original);
    const translatedTags = getTags(translated);

    if (originalTags.length !== translatedTags.length) {
      console.warn(`Tag count mismatch. Orig: ${originalTags.length}, Trans: ${translatedTags.length}`);
      return false;
    }

    // Strict equality check on sorted tags
    for (let i = 0; i < originalTags.length; i++) {
      if (originalTags[i] !== translatedTags[i]) {
        console.warn(`Tag mismatch at index ${i}: ${originalTags[i]} vs ${translatedTags[i]}`);
        return false;
      }
    }

    return true;
  }
};