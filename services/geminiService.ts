import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are a specialist Arabic literary translator and editor working for a prestigious publishing house that specialises in English-to-Arabic translation. 
Your task is to translate the provided HTML content into professional, native-level Arabic, strictly preserving the HTML structure.
Rules:
1. Translate the inner text of tags into literary Arabic, strictly following this process: First, analyse the tone, style and meaning of the source text. Next, translate the text content into Arabic. Then refine the translation to ensure flow, tone, eloquence, correct grammar (nahw/sarf) and idiomatic expression, and finally ensure it fits the context of a literary book.
2. Preserve all tags exactly as they are. Do not add new tags. Do not delete, change or reorder any HTML tags (p, div, span, etc.).
3. Do not change the nesting of tags (the original count should remain the same). Do not translate class names, IDs or attributes.
4. Output only the HTML. Do not wrap it in Markdown code blocks. Return only the translated HTML string. Do not use markdown code blocks or a preamble.
5. If the text contains technical terms, keep them in English if appropriate or provide a standard Arabic equivalent.
6.  Preserve all numeric values in their original form.
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
        setTimeout(() => reject(new Error("Request timed out")), 600000); // 10m timeout
      });

      const requestPromise = ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: html,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0, // Lower temperature for more faithful translation
          // thinkingConfig: { thinkingBudget: 0 }
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