import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Type } from "@google/genai";
import { LogType, GlossaryTerm, GlossaryCategory, Segment } from '../types';
import { callWithRetryAndTimeout } from '../lib/aiUtils';
import { normalizeGlossaryKey } from './db';

const SYSTEM_INSTRUCTION = `You are a specialist Arabic literary translator and editor working for a prestigious publishing house that specialises in English-to-Arabic translation. 
Your task is to translate the provided HTML content into professional, easy to understand, native-level Arabic, strictly preserving the HTML structure.
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

export const isQuotaError = (err: any): boolean => {
  if (!err) return false;
  const msg = String(err.message || err || '').toLowerCase();
  return (
    err.status === 429 ||
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit')
  );
};

export const stripHtmlToPlainText = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

export const matchGlossaryTermsForHtml = (
  html: string,
  glossary: GlossaryTerm[]
): GlossaryTerm[] => {
  if (!html || !glossary || glossary.length === 0) return [];
  const plainTextLower = stripHtmlToPlainText(html).toLowerCase();
  if (!plainTextLower) return [];

  const matched: GlossaryTerm[] = [];
  for (const term of glossary) {
    if (!term?.source || !term?.target) continue;
    const rawSource = String(term.source).trim().toLowerCase();
    const strippedThe = rawSource.replace(/^the\s+/i, '');
    if (!rawSource) continue;

    if (
      plainTextLower.includes(rawSource) ||
      (strippedThe.length >= 3 && plainTextLower.includes(strippedThe))
    ) {
      matched.push(term);
    }
  }

  return matched.slice(0, 60);
};

const formatGlossaryBlock = (matchedGlossary: GlossaryTerm[]): string => {
  if (!matchedGlossary || matchedGlossary.length === 0) return '';

  const lines = matchedGlossary.map((t) => {
    const notePart = t.notes ? ` (${t.notes})` : '';
    return `- "${t.source}" ➔ "${t.target}" [${t.category}]${notePart}`;
  });

  return `\n\nMANDATORY TERMINOLOGY & CONSISTENCY GLOSSARY:
The following recurring terms, names, locations, titles, and key concepts appear in this segment. You MUST strictly use the established Arabic translation specified below whenever translating these terms (adjusting only attached Arabic prefixes/articles/pronouns as grammatically required while keeping the core Arabic root/name identical):
${lines.join('\n')}\n`;
};

const normalizeCategory = (raw: string): GlossaryCategory => {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('char') || lower.includes('person') || lower.includes('name')) return 'character';
  if (lower.includes('loc') || lower.includes('place') || lower.includes('city') || lower.includes('world')) return 'location';
  if (lower.includes('title') || lower.includes('rank') || lower.includes('honor') || lower.includes('org')) return 'title';
  return 'concept';
};

export interface InitialGlossaryScanResult {
  terms: GlossaryTerm[];
  succeeded: boolean;
  quotaExhausted: boolean;
}

export const geminiService = {
  matchGlossaryTermsForHtml,
  stripHtmlToPlainText,
  isQuotaError,

  async translateHtml(
    html: string,
    onLog?: LoggerCallback,
    mode: 'normal' | 'second_mode' = 'normal',
    matchedGlossary: GlossaryTerm[] = []
  ): Promise<string> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("API Key is missing.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE }
    ];

    const SECOND_MODE_SYSTEM_INSTRUCTION = `You are a specialist Arabic literary translator and editor working for a prestigious publishing house.
Your task is to translate the provided HTML content into professional, native-level Arabic, strictly preserving the HTML structure.

IMPORTANT CONTEXT:
- The source text is from a fictional literary work (novel).
- It includes dialogue, dramatic situations, and may contain mature themes, violence, or sensitive topics typical of fiction.
- Your goal is to translate FAITHFULLY and ACCURATELY. 
- Do NOT censor, sanitize, or summarize. Do NOT refuse to translate based on the fictional characters' actions or dialogue.
- Preserve the original tone, style, and meaning of the narrative.

Rules:
1. Translate the inner text of tags into literary Arabic. Match the tone of the source.
2. Preserve all tags exactly. Do not add new tags. Do not delete, change or reorder any HTML tags.
3. Do not change the nesting of tags. Do not translate class names, IDs or attributes.
4. Output only the HTML. Do not wrap it in Markdown code blocks.
5. If the text contains technical terms, keep them in English if appropriate or provide a standard Arabic equivalent.
6. Preserve all numeric values.`;

    const SECOND_MODE_MODELS = ['gemini-2.5-pro', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
    const SECOND_MODE_TEMPERATURE = 1;

    const baseInstruction = mode === 'second_mode' ? SECOND_MODE_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION;
    const glossaryBlock = formatGlossaryBlock(matchedGlossary);
    const activeSystemInstruction = baseInstruction + glossaryBlock;

    const activeTemperature = mode === 'second_mode' ? SECOND_MODE_TEMPERATURE : 0.3;
    const modelsToTry = mode === 'second_mode'
      ? SECOND_MODE_MODELS
      : ['gemini-flash-latest', 'gemini-3.7-flash'  /* , 'gemini-flash-lite-latest'  */ ];

    let lastError: Error | null = null;
    let quotaError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        onLog?.(`Attempting translation with ${model} (Mode: ${mode}, Glossary matches: ${matchedGlossary.length})...`, 'INFO', {
          inputLength: html.length,
          model,
          glossaryTermsMatched: matchedGlossary.map(g => `${g.source} -> ${g.target}`)
        });

        const startTime = Date.now();

        const response = await callWithRetryAndTimeout(
          () => ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: html }] },
            config: {
              systemInstruction: activeSystemInstruction,
              temperature: activeTemperature,
              safetySettings: safetySettings,
            }
          }),
          {
            timeoutMs: 90000,
            retries: 3,
            onRetry: (error, attempt) => {
              onLog?.(`Retrying ${model} due to error: ${error.message} (Attempt ${attempt}/3)...`, 'WARNING');
            }
          }
        );

        const duration = Date.now() - startTime;
        const finishReason = response.candidates?.[0]?.finishReason;
        const translatedText = response.text?.trim();

        onLog?.(`Response from ${model} in ${duration}ms`, 'INFO', { finishReason });

        if (!translatedText) {
          if (finishReason && finishReason !== 'STOP') {
            throw new Error(`AI Safety/Filter Block (${finishReason})`);
          }
          throw new Error("Empty response from AI");
        }

        const cleanHtml = translatedText.replace(/^```html/, '').replace(/```$/, '').trim();

        if (!this.validateIntegrity(html, cleanHtml, onLog)) {
          throw new Error("Integrity Check Failed: Tag mismatch.");
        }

        onLog?.("Translation successful.", 'SUCCESS');
        return cleanHtml;

      } catch (error) {
        console.warn(`Translation failed with ${model}:`, error);
        const err = error as Error;
        lastError = err;
        if (isQuotaError(err)) {
          quotaError = err;
        }
        onLog?.(`Model ${model} failed: ${err.message}. Switching models...`, 'WARNING');
      }
    }

    onLog?.("All models failed to translate segment.", 'ERROR');
    // Preserve 429 quota error if any model in the chain failed due to quota exhaustion
    throw quotaError || lastError || new Error("Translation failed on all available models.");
  },

  async extractInitialBookGlossary(
    segments: Segment[],
    bookTitle: string,
    onLog?: LoggerCallback
  ): Promise<InitialGlossaryScanResult> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("API Key is missing.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const maxSampleChars = 36000;
    const validSegments = segments
      .map(s => stripHtmlToPlainText(s.originalHtml))
      .filter(t => t.length > 80);

    if (validSegments.length === 0) {
      return { terms: [], succeeded: true, quotaExhausted: false };
    }

    const step = Math.max(1, Math.floor(validSegments.length / 24));
    const sampledChunks: string[] = [];
    let currentChars = 0;

    for (let i = 0; i < validSegments.length && currentChars < maxSampleChars; i += step) {
      const snippet = validSegments[i].slice(0, 1800);
      sampledChunks.push(snippet);
      currentChars += snippet.length;
    }

    const combinedSample = sampledChunks.join('\n\n---\n\n');

    onLog?.(`Scanning book sample (${sampledChunks.length} sections, ${currentChars} chars) to build terminology glossary...`, 'INFO');

    const prompt = `You are a Chief Arabic Literary Editor preparing a canonical Terminology & Consistency Glossary before translating the book "${bookTitle}" from English into Arabic.

Analyze the following sampled excerpts from across the book and extract up to 60 of the most important recurring terms that could be translated inconsistently if different translators worked on different chapters.

Include:
1. "character": Recurring character names, family names, or mythical beings (establish a single consistent Arabic transliteration or translation and specify gender in notes).
2. "location": Cities, realms, buildings, institutions, or geographical names.
3. "title": Honorifics, ranks, professions, factions, or organizational titles (e.g., "The Warden", "High Council", "Chancellor").
4. "concept": Recurring domain-specific terms, philosophical/literary motifs, specialized objects, or ambiguous English words that recur with a specific meaning in this book.

Return a JSON array of objects.`;

    const modelsToTry = ['gemini-flash-latest', 'gemini-3.7-flash', 'gemini-flash-lite-latest'];
    let quotaError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        const response = await callWithRetryAndTimeout(
          () => ai.models.generateContent({
            model,
            contents: {
              parts: [
                { text: prompt },
                { text: `--- BOOK EXCERPTS ---\n${combinedSample}` }
              ]
            },
            config: {
              temperature: 0.2,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source: {
                      type: Type.STRING,
                      description: "Original English term, name, title, or recurring concept",
                    },
                    target: {
                      type: Type.STRING,
                      description: "Single canonical Arabic translation or transliteration to use throughout the entire book",
                    },
                    category: {
                      type: Type.STRING,
                      description: "One of: character, location, title, concept",
                    },
                    notes: {
                      type: Type.STRING,
                      description: "Brief grammatical gender or context note (e.g., 'Masculine singular title', 'City name')",
                    },
                  },
                  required: ["source", "target", "category"],
                },
              },
            },
          }),
          {
            timeoutMs: 60000,
            retries: 3,
            delayMs: 2000,
            onRetry: (error, attempt) => {
              onLog?.(`Retrying glossary scan with ${model}: ${error.message} (Attempt ${attempt}/3)...`, 'WARNING');
            }
          }
        );

        const rawJson = response.text?.trim();
        if (!rawJson) continue;

        const parsed = JSON.parse(rawJson);
        if (!Array.isArray(parsed)) continue;

        const now = Date.now();
        const terms: GlossaryTerm[] = [];
        const seen = new Set<string>();

        for (const item of parsed) {
          if (!item?.source || !item?.target) continue;
          const id = normalizeGlossaryKey(item.source);
          if (!id || id.length < 2 || seen.has(id)) continue;
          seen.add(id);

          terms.push({
            id,
            source: String(item.source).trim(),
            target: String(item.target).trim(),
            category: normalizeCategory(item.category),
            notes: item.notes ? String(item.notes).trim() : undefined,
            sourceType: 'auto-scan',
            createdAt: now,
          });
        }

        onLog?.(`Auto-extracted ${terms.length} canonical glossary terms using ${model}.`, 'SUCCESS', {
          sampleCount: terms.slice(0, 10),
        });
        return { terms, succeeded: true, quotaExhausted: false };
      } catch (err) {
        console.warn(`Glossary extraction with ${model} failed:`, err);
        if (isQuotaError(err)) {
          quotaError = err as Error;
        }
        onLog?.(`Glossary scan attempt with ${model} failed: ${(err as Error).message}. Switching models...`, 'WARNING');
      }
    }

    return {
      terms: [],
      succeeded: false,
      quotaExhausted: Boolean(quotaError),
    };
  },

  async extractNewTermsFromSegment(
    originalHtml: string,
    translatedHtml: string,
    existingGlossary: GlossaryTerm[],
    onLog?: LoggerCallback
  ): Promise<GlossaryTerm[]> {
    if (!process.env.GEMINI_API_KEY) return [];

    const plainSource = stripHtmlToPlainText(originalHtml);
    const plainTarget = stripHtmlToPlainText(translatedHtml);
    if (plainSource.length < 120 || plainTarget.length < 80) return [];

    const existingKeys = new Set(existingGlossary.map(g => g.id));
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const existingSample = existingGlossary
      .slice(0, 80)
      .map(g => g.source)
      .join(', ');

    const prompt = `Compare the English source passage and its Arabic translation below.
Identify up to 5 NEW recurring proper nouns (character names, locations), titles/ranks, or specialized recurring concepts that appear in this passage and should be locked in for consistency in future chapters.
Do NOT include common everyday words, and do NOT include terms already in this list: [${existingSample}].
If there are no notable new terms, return an empty array [].`;

    // Use gemini-flash-lite-latest first so live glossary learning has its own dedicated quota bucket
    const liveModelsToTry = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

    for (const model of liveModelsToTry) {
      try {
        const response = await callWithRetryAndTimeout(
          () => ai.models.generateContent({
            model,
            contents: {
              parts: [
                { text: prompt },
                { text: `English: ${plainSource.slice(0, 2500)}\n\nArabic: ${plainTarget.slice(0, 2500)}` }
              ]
            },
            config: {
              temperature: 0.1,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source: { type: Type.STRING },
                    target: { type: Type.STRING },
                    category: { type: Type.STRING },
                    notes: { type: Type.STRING },
                  },
                  required: ["source", "target", "category"],
                },
              },
            },
          }),
          {
            timeoutMs: 25000,
            retries: 3,
            delayMs: 2000,
            onRetry: (error, attempt) => {
              onLog?.(`Retrying live glossary extraction with ${model}: ${error.message} (Attempt ${attempt}/3)...`, 'WARNING');
            }
          }
        );

        const text = response.text?.trim();
        if (!text) continue;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) continue;

        const now = Date.now();
        const newTerms: GlossaryTerm[] = [];

        for (const item of parsed) {
          if (!item?.source || !item?.target) continue;
          const id = normalizeGlossaryKey(item.source);
          if (!id || id.length < 2 || existingKeys.has(id)) continue;
          existingKeys.add(id);

          newTerms.push({
            id,
            source: String(item.source).trim(),
            target: String(item.target).trim(),
            category: normalizeCategory(item.category),
            notes: item.notes ? String(item.notes).trim() : undefined,
            sourceType: 'auto-live',
            createdAt: now,
          });
        }

        if (newTerms.length > 0) {
          onLog?.(`Learned ${newTerms.length} new glossary term(s) from segment using ${model}.`, 'INFO', {
            terms: newTerms.map(t => `${t.source} -> ${t.target}`)
          });
        }

        return newTerms;
      } catch (err) {
        onLog?.(`Live glossary extraction failed on ${model}: ${(err as Error).message}`, 'WARNING');
      }
    }

    return [];
  },

  async translateTitle(title: string): Promise<string> {
    if (!process.env.GEMINI_API_KEY) throw new Error("API Key is missing.");

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await callWithRetryAndTimeout(
      () => ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: { parts: [{ text: `Translate this book title into Arabic. Return ONLY the Arabic title, no other text. Title: "${title}"` }] },
      }),
      { timeoutMs: 30000, retries: 2, delayMs: 2000 }
    );

    return response.text?.trim() || "";
  },

  validateIntegrity(original: string, translated: string, onLog?: LoggerCallback): boolean {
    const getTags = (str: string) => {
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
