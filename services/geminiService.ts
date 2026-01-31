import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { LogType } from '../types';

const SYSTEM_INSTRUCTION = `You are a specialist Arabic literary translator and editor working for a prestigious publishing house that specialises in English-to-Arabic translation. 
Your task is to translate the provided HTML content into professional, native-level Arabic, strictly preserving the HTML structure.
Rules:
1. Translate the inner text of tags into literary Arabic, strictly following this process: First, analyse the tone, style and meaning of the source text. Next, translate the text content into Arabic. Then refine the translation to ensure flow, tone, eloquence, correct grammar (nahw/sarf) and idiomatic expression, and finally ensure it fits the context of a literary book.
2. Preserve all tags exactly as they are. Do not add new tags. Do not delete, change or reorder any HTML tags (p, div, span, etc.).
3. Do not change the nesting of tags (the original count should remain the same). Do not translate class names, IDs or attributes.
4. Output only the HTML. Do not wrap it in Markdown code blocks. Return only the translated HTML string. Do not use markdown code blocks or a preamble.
5. If the text contains technical terms, keep them in English if appropriate or provide a standard Arabic equivalent.
6. Preserve all numeric values in their original form.

and always remember, A. Preserve all tags exactly. Do not add new tags. Do not delete, change or reorder any HTML tags.
B. Do not change the nesting of tags. Do not translate class names, IDs or attributes.
C. Output only the HTML. Do not wrap it in Markdown code blocks.

this is the most important and dangerous thing for me.
`;

type LoggerCallback = (msg: string, type: LogType, data?: any) => void;

export const geminiService = {
  async translateHtml(html: string, onLog?: LoggerCallback): Promise<string> {
    if (!process.env.API_KEY) {
      throw new Error("API Key is missing.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Configure safety settings to be maximally permissive for literary fiction
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE }
    ];

    // Fallback strategy: Try Pr o model first, then Flash if Pro is too strict/busy
    const modelsToTry = ['gemini-3-pro-preview',  'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
        try {
            onLog?.(`Attempting translation with ${model}...`, 'INFO', { 
                inputLength: html.length,
                model
            });

            const startTime = Date.now();

            // Create a timeout promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error("Request timed out")), 600000); // 10m timeout
            });

            const requestPromise = ai.models.generateContent({
                model: model,
                contents: { parts: [{ text: html }] },
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION,
                    temperature: 0, // Slightly higher for literary creativity
                    safetySettings: safetySettings,
                }
            });

            // Race against timeout
            const response = await Promise.race([requestPromise, timeoutPromise]);
            const duration = Date.now() - startTime;
            const finishReason = response.candidates?.[0]?.finishReason;
            const translatedText = response.text?.trim();

            onLog?.(`Response from ${model} in ${duration}ms`, 'INFO', { finishReason });

            if (!translatedText) {
                // If text is empty, it's likely a safety block or finish reason issue
                if (finishReason && finishReason !== 'STOP') {
                    throw new Error(`AI Safety/Filter Block (${finishReason})`);
                }
                throw new Error("Empty response from AI");
            }

            // Cleanup
            const cleanHtml = translatedText.replace(/^```html/, '').replace(/```$/, '').trim();

            if (!this.validateIntegrity(html, cleanHtml, onLog)) {
                throw new Error("Integrity Check Failed: Tag mismatch.");
            }
            
            onLog?.("Translation successful.", 'SUCCESS');
            return cleanHtml;

        } catch (error) {
            console.warn(`Translation failed with ${model}:`, error);
            lastError = error as Error;
            onLog?.(`Model ${model} failed: ${(error as Error).message}. Switching models...`, 'WARNING');
            // Loop continues to next model
        }
    }

    onLog?.("All models failed to translate segment.", 'ERROR');
    throw lastError || new Error("Translation failed on all available models.");
  },

  validateIntegrity(original: string, translated: string, onLog?: LoggerCallback): boolean {
    const getTags = (str: string) => {
      // Regex to match opening and closing tags, ignoring attributes
      return (str.match(/<\/?\w+/g) || []).sort();
    };

    const originalTags = getTags(original);
    const translatedTags = getTags(translated);

    if (originalTags.length !== translatedTags.length) {
      const msg = `Tag count mismatch. Orig: ${originalTags.length}, Trans: ${translatedTags.length}`;
      console.warn(msg);
      onLog?.("Integrity check warning", 'WARNING', { message: msg, originalTags, translatedTags });
      return false;
    }

    // Strict equality check on sorted tags
    for (let i = 0; i < originalTags.length; i++) {
      if (originalTags[i] !== translatedTags[i]) {
        const msg = `Tag mismatch at index ${i}: ${originalTags[i]} vs ${translatedTags[i]}`;
        console.warn(msg);
        onLog?.("Integrity check warning", 'WARNING', { message: msg });
        return false;
      }
    }

    return true;
  }
};
