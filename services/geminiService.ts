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

export interface ModelFailureReport {
  model: string;
  error: Error;
  isQuota: boolean;
  isIntegrity: boolean;
  isRefusal?: boolean;
  message: string;
}

export class AllModelsQuotaError extends Error {
  readonly isAllModelsQuota = true;
  readonly status = 429;
  constructor(message: string, public readonly reports: ModelFailureReport[]) {
    super(message);
    this.name = 'AllModelsQuotaError';
  }
}

export class TranslationIntegrityError extends Error {
  readonly isIntegrity = true;
  readonly isAllModelsQuota = false;
  constructor(message: string, public readonly reports: ModelFailureReport[]) {
    super(message);
    this.name = 'TranslationIntegrityError';
  }
}

export class TranslationRefusalError extends Error {
  readonly isRefusal = true;
  readonly isAllModelsQuota = false;
  constructor(message: string, public readonly reports: ModelFailureReport[] = []) {
    super(message);
    this.name = 'TranslationRefusalError';
  }
}

export const isQuotaError = (err: any): boolean => {
  if (!err) return false;
  // If explicitly flagged as NOT all-models quota or an integrity/refusal error, it's not a quota pause
  if (err.isAllModelsQuota === false || err.isIntegrity === true || err.isRefusal === true) {
    return false;
  }
  if (err.isAllModelsQuota === true) {
    return true;
  }
  const msg = String(err.message || err || '').toLowerCase();
  // Never classify a tag mismatch, refusal, or non-translation as a quota pause
  if (
    msg.includes('tag mismatch') ||
    msg.includes('integrity check failed') ||
    msg.includes('refusal') ||
    msg.includes('non-arabic') ||
    msg.includes('untranslated')
  ) {
    return false;
  }
  return (
    err.status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    (msg.includes('quota') && !msg.includes('tag mismatch') && !msg.includes('refusal'))
  );
};

export const isAiRefusalOrCommentary = (text: string): { isRefusal: boolean; reason?: string } => {
  if (!text || text.trim().length === 0) return { isRefusal: true, reason: 'Empty response from model' };
  const trimmed = text.trim();

  // Standard English refusal & disclaimer patterns
  const englishRefusalPatterns = [
    /^(?:i\s*(?:cannot|can't|am unable to|am sorry|apologize|must decline)|as an ai|my safety policies|i am not able to|i'm unable to|i cannot assist)/i,
    /(?:cannot fulfill this request|violates content policy|against safety guidelines|i cannot translate this)/i,
    /^(?:sorry,\s*but\s*i\s*(?:cannot|can't)|unfortunately,\s*i\s*(?:cannot|can't))/i,
  ];

  for (const pattern of englishRefusalPatterns) {
    if (pattern.test(trimmed)) {
      return { isRefusal: true, reason: 'AI safety refusal or policy disclaimer detected' };
    }
  }

  // Arabic refusal & disclaimer patterns
  const arabicRefusalPatterns = [
    /^(?:عذراً|أعتذر|لا أستطيع|لا يمكنني|بصفتي نموذج ذكاء|يؤسفني|لا يمكن تلبية)/i,
    /(?:لا أستطيع تلبية هذا الطلب|ينتهك السياسات|لا يمكنني ترجمة هذا النص|لا أستطيع مساعدتك في هذا)/i,
  ];

  for (const pattern of arabicRefusalPatterns) {
    if (pattern.test(trimmed)) {
      return { isRefusal: true, reason: 'Arabic AI refusal or policy disclaimer detected' };
    }
  }

  return { isRefusal: false };
};

export const hasArabicCharacters = (text: string): boolean => {
  if (!text) return false;
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
};

export const sanitizeAiHtml = (raw: string): string => {
  if (!raw) return '';
  let cleaned = raw.trim();

  // Strip opening markdown code block (```html, ```xml, ```)
  cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\s*\n?/i, '');
  // Strip trailing markdown code block (```)
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  cleaned = cleaned.trim();

  // Strip conversational preamble if followed by actual HTML tags:
  // e.g. "Here is the Arabic translation:\n\n<p>...</p>"
  const firstTagIdx = cleaned.indexOf('<');
  const lastTagIdx = cleaned.lastIndexOf('>');
  if (firstTagIdx > 0 && lastTagIdx > firstTagIdx) {
    const preamble = cleaned.substring(0, firstTagIdx).trim().toLowerCase();
    const isPreamble =
      preamble.includes('here is') ||
      preamble.includes('certainly') ||
      preamble.includes('below is') ||
      preamble.includes('translation:') ||
      preamble.includes('translated html') ||
      preamble.includes('sure') ||
      preamble.includes('الترجمة:') ||
      preamble.includes('إليك الترجمة');
    if (isPreamble) {
      cleaned = cleaned.substring(firstTagIdx, lastTagIdx + 1).trim();
    }
  }

  return cleaned.trim();
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

export const splitTextIntoSentences = (text: string): string[] => {
  if (!text) return [];
  // Split on sentence-ending punctuation (. ! ? ؟ or newline) followed by whitespace, preserving sentence boundaries
  const rawSentences = text
    .split(/(?<=[.!?؟\n])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (rawSentences.length === 0 && text.trim()) {
    return [text.trim()];
  }
  return rawSentences;
};

export const geminiService = {
  matchGlossaryTermsForHtml,
  stripHtmlToPlainText,
  splitTextIntoSentences,
  isQuotaError,

  async translateSingleSentence(
    sentence: string,
    onLog?: LoggerCallback,
    matchedGlossary: GlossaryTerm[] = []
  ): Promise<{ success: boolean; text: string; isRefusal: boolean }> {
    if (!sentence || !sentence.trim()) {
      return { success: true, text: sentence, isRefusal: false };
    }

    // If text contains no letters (pure numbers, punctuation, or whitespace), return as-is
    if (!/[a-zA-Z]/.test(sentence)) {
      return { success: true, text: sentence, isRefusal: false };
    }

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

    const glossaryBlock = formatGlossaryBlock(matchedGlossary);
    const systemPrompt = `You are an expert Arabic literary translator working on a published novel.
Your task is to translate this single sentence from the literary text into natural, fluent Arabic.
Context: This is an excerpt from a published literary fiction work. Do not censor, summarize, or refuse. Output ONLY the translated Arabic sentence, with no surrounding quotes, markdown, or commentary.${glossaryBlock}`;

    const SECOND_MODE_MODELS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

    for (const model of SECOND_MODE_MODELS) {
      try {
        const response = await callWithRetryAndTimeout(
          () => ai.models.generateContent({
            model,
            contents: { parts: [{ text: sentence }] },
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.7,
              safetySettings,
            }
          }),
          { timeoutMs: 30000, retries: 1 }
        );

        const text = response.text?.trim();
        if (!text) continue;

        const refusalCheck = isAiRefusalOrCommentary(text);
        if (refusalCheck.isRefusal) {
          onLog?.(`Sentence-level AI refusal on ${model}: "${sentence.slice(0, 40)}..."`, 'WARNING');
          continue; // Try next model
        }

        // Check if Arabic was produced
        const clean = sanitizeAiHtml(text);
        if (!hasArabicCharacters(clean) && /[a-zA-Z]{3,}/.test(sentence)) {
          continue;
        }

        return { success: true, text: clean, isRefusal: false };
      } catch (err: any) {
        if (isQuotaError(err)) {
          throw err;
        }
      }
    }

    return { success: false, text: sentence, isRefusal: true };
  },

  async translateWithMicroSegmentation(
    html: string,
    onLog?: LoggerCallback,
    matchedGlossary: GlossaryTerm[] = []
  ): Promise<{ translatedHtml: string; isolatedSentencesCount: number }> {
    if (!html || !html.trim()) {
      return { translatedHtml: '', isolatedSentencesCount: 0 };
    }

    onLog?.("Starting Second Mode Micro-Segmentation / Sub-Sentence Isolation...", 'INFO');

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
    const childNodes = Array.from(doc.body.childNodes);

    if (childNodes.length === 0) {
      return { translatedHtml: html, isolatedSentencesCount: 0 };
    }

    let totalIsolated = 0;
    const translatedNodes: string[] = [];

    for (const node of childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const outerHtml = el.outerHTML;

        // Level 1: Try translating the single block element in Second Mode
        try {
          const translatedElHtml = await this.translateHtml(
            outerHtml,
            onLog,
            'second_mode',
            matchedGlossary
          );
          translatedNodes.push(translatedElHtml);
          continue;
        } catch (err: any) {
          if (isQuotaError(err)) {
            throw err; // Quota pauses execution as expected
          }
          onLog?.(`Block <${el.tagName.toLowerCase()}> refused. Decomposing into sentences...`, 'INFO');
        }

        // Level 2: Sentence-level decomposition within the refused element
        const tagName = el.tagName.toLowerCase();
        const attributes = Array.from(el.attributes)
          .map(attr => `${attr.name}="${attr.value}"`)
          .join(' ');
        const attrString = attributes ? ` ${attributes}` : '';

        const textContent = el.textContent || '';
        if (!textContent.trim()) {
          translatedNodes.push(outerHtml);
          continue;
        }

        const sentences = splitTextIntoSentences(textContent);
        const translatedParts: string[] = [];

        for (const sentence of sentences) {
          if (!sentence.trim()) continue;

          const sentResult = await this.translateSingleSentence(
            sentence,
            onLog,
            matchedGlossary
          );

          if (sentResult.success && sentResult.text) {
            translatedParts.push(sentResult.text);
          } else if (sentResult.isRefusal) {
            totalIsolated++;
            const escaped = sentence.replace(/"/g, '&quot;');
            translatedParts.push(
              `<span class="isolated-refusal" data-original="${escaped}" title="AI Safety Policy Refusal: Isolated for manual review">${sentence}</span>`
            );
            onLog?.(`Offending sentence isolated: "${sentence.slice(0, 50)}..."`, 'WARNING');
          } else {
            translatedParts.push(sentence);
          }
        }

        const reconstructed = `<${tagName}${attrString}>${translatedParts.join(' ')}</${tagName}>`;
        translatedNodes.push(reconstructed);

      } else if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (!text.trim()) {
          translatedNodes.push(text);
          continue;
        }

        const sentences = splitTextIntoSentences(text);
        const parts: string[] = [];
        for (const sentence of sentences) {
          if (!sentence.trim()) continue;
          const sentResult = await this.translateSingleSentence(sentence, onLog, matchedGlossary);
          if (sentResult.success && sentResult.text) {
            parts.push(sentResult.text);
          } else if (sentResult.isRefusal) {
            totalIsolated++;
            const escaped = sentence.replace(/"/g, '&quot;');
            parts.push(
              `<span class="isolated-refusal" data-original="${escaped}" title="AI Safety Policy Refusal: Isolated for manual review">${sentence}</span>`
            );
          } else {
            parts.push(sentence);
          }
        }
        translatedNodes.push(parts.join(' '));
      }
    }

    const finalHtml = translatedNodes.join('\n');
    onLog?.(`Micro-segmentation complete: ${totalIsolated} sensitive sentence(s) isolated cleanly.`, totalIsolated > 0 ? 'WARNING' : 'SUCCESS');

    return {
      translatedHtml: finalHtml,
      isolatedSentencesCount: totalIsolated
    };
  },

  async repairHtmlTags(
    ai: GoogleGenAI,
    model: string,
    originalHtml: string,
    flawedHtml: string,
    onLog?: LoggerCallback
  ): Promise<string | null> {
    try {
      const repairPrompt = `You are an expert HTML tag repair assistant for Arabic literary translations.
The following translated Arabic HTML has tag mismatches (missing, extra, or incorrectly ordered tags) compared to the original English HTML.

TASK:
- Restore the exact HTML tag structure, tags, attributes, and nesting from the ORIGINAL HTML.
- Keep the Arabic translated text completely intact and properly placed inside corresponding tags.
- Output ONLY the corrected HTML string.
- Do NOT wrap in markdown code blocks (\`\`\`html).

ORIGINAL HTML (Exact tags to match):
${originalHtml}

FLAWED ARABIC TRANSLATION:
${flawedHtml}`;

      const response = await callWithRetryAndTimeout(
        () => ai.models.generateContent({
          model,
          contents: { parts: [{ text: repairPrompt }] },
          config: {
            temperature: 0.0,
          }
        }),
        { timeoutMs: 35000, retries: 1 }
      );

      const text = response.text?.trim();
      if (!text) return null;
      return sanitizeAiHtml(text);
    } catch (repairErr) {
      onLog?.(`Tag self-repair attempt failed with ${model}: ${(repairErr as Error).message}`, 'WARNING');
      return null;
    }
  },

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

    const SECOND_MODE_MODELS = [ 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
    const SECOND_MODE_TEMPERATURE = 1;

    const baseInstruction = mode === 'second_mode' ? SECOND_MODE_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION;
    const glossaryBlock = formatGlossaryBlock(matchedGlossary);
    const activeSystemInstruction = baseInstruction + glossaryBlock;

    const activeTemperature = mode === 'second_mode' ? SECOND_MODE_TEMPERATURE : 0.3;
    const modelsToTry = mode === 'second_mode'
      ? SECOND_MODE_MODELS
      : ['gemini-flash-latest', 'gemini-3.7-flash'];

    const failureReports: ModelFailureReport[] = [];

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

        let cleanHtml = sanitizeAiHtml(translatedText);

        // 1. Refusal / Policy Disclaimer check:
        // Do NOT attempt tag repair on a refusal! Attempting tag repair on a refusal would embed AI refusals into book tags.
        const refusalCheck = isAiRefusalOrCommentary(cleanHtml);
        if (refusalCheck.isRefusal) {
          throw new TranslationRefusalError(`AI Refusal: ${refusalCheck.reason} ("${cleanHtml.slice(0, 100)}...")`);
        }

        // 2. Language Verification: Did the model actually output Arabic?
        const origPlainText = stripHtmlToPlainText(html);
        const transPlainText = stripHtmlToPlainText(cleanHtml);
        const origHasText = origPlainText.length > 15 && /[a-zA-Z]{3,}/.test(origPlainText);

        if (origHasText && !hasArabicCharacters(transPlainText)) {
          throw new TranslationRefusalError(`Model returned untranslated non-Arabic output instead of Arabic translation: "${cleanHtml.slice(0, 100)}..."`);
        }

        // 3. Tag Integrity Check & Safe Self-Repair:
        // Because cleanHtml is verified to contain real Arabic translation text, we can safely attempt tag repair if tags are slightly mismatched.
        if (!this.validateIntegrity(html, cleanHtml, onLog)) {
          onLog?.(`Model ${model} returned tag mismatch on Arabic translation. Attempting self-repair pass...`, 'WARNING');
          const repaired = await this.repairHtmlTags(ai, model, html, cleanHtml, onLog);
          if (repaired && this.validateIntegrity(html, repaired, onLog)) {
            onLog?.(`Tag mismatch successfully repaired for ${model}! Integrity verified.`, 'SUCCESS');
            cleanHtml = repaired;
          } else {
            throw new TranslationIntegrityError(`Integrity Check Failed: Tag mismatch from ${model}.`, []);
          }
        }

        onLog?.(`Translation successful using ${model}.`, 'SUCCESS');
        return cleanHtml;

      } catch (error) {
        console.warn(`Translation attempt failed with ${model}:`, error);
        const err = error as Error;
        const isQuota = isQuotaError(err);
        const isIntegrity = Boolean((err as any).isIntegrity) || err.message?.toLowerCase().includes('tag mismatch');
        const isRefusal = Boolean((err as any).isRefusal) || err.message?.toLowerCase().includes('refusal') || err.message?.toLowerCase().includes('non-arabic');

        failureReports.push({
          model,
          error: err,
          isQuota,
          isIntegrity,
          isRefusal,
          message: err.message,
        });

        const failureType = isQuota ? 'API 429 Quota' : isRefusal ? 'AI Refusal/Non-Arabic' : isIntegrity ? 'Tag Mismatch' : err.message;
        onLog?.(`Model ${model} failed (${failureType}). Switching models...`, 'WARNING');
      }
    }

    onLog?.("All models in chain completed attempts.", 'ERROR');

    // Industry Best Practice Decision:
    // Only output / treat as Quota Hit if ALL attempted models failed due to quota (429/resource_exhausted).
    const allModelsHitQuota = failureReports.length > 0 && failureReports.every(f => f.isQuota);

    if (allModelsHitQuota) {
      const quotaDetails = failureReports.map(f => `${f.model} (429 Quota)`).join(', ');
      onLog?.(`API Quota hit on all models (${quotaDetails}). System will pause.`, 'ERROR');
      throw new AllModelsQuotaError(`API Quota hit on all models: ${quotaDetails}`, failureReports);
    }

    // If NOT all models hit quota:
    // The failure of this segment is an INTEGRITY / refusal / formatting failure, NOT an all-models quota exhaustion!
    const integrityReport = failureReports.find(f => f.isIntegrity);
    const refusalReport = failureReports.find(f => f.isRefusal);
    const quotaReport = failureReports.find(f => f.isQuota);

    let compositeMsg: string;
    if (refusalReport && quotaReport) {
      compositeMsg = `Translation Rejected: AI Refusal/Non-Arabic output on ${refusalReport.model}; ${quotaReport.model} hit 429 quota.`;
    } else if (refusalReport) {
      compositeMsg = `Translation Rejected: AI model returned refusal or non-Arabic output (${refusalReport.message}).`;
    } else if (integrityReport && quotaReport) {
      compositeMsg = `Integrity Check Failed: Tag mismatch on ${integrityReport.model}; ${quotaReport.model} hit 429 quota.`;
    } else if (integrityReport) {
      compositeMsg = `Integrity Check Failed: Tag mismatch (${integrityReport.message}).`;
    } else {
      compositeMsg = `Translation failed across models: ${failureReports.map(f => `${f.model} (${f.message})`).join('; ')}`;
    }

    onLog?.(`Segment translation failed (non-quota): ${compositeMsg}. Worker will proceed.`, 'WARNING');
    if (refusalReport) {
      throw new TranslationRefusalError(compositeMsg, failureReports);
    }
    throw new TranslationIntegrityError(compositeMsg, failureReports);
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
    const scanAttempts: { model: string; isQuota: boolean; error: Error }[] = [];

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
        const isQuota = isQuotaError(err);
        scanAttempts.push({ model, isQuota, error: err as Error });
        onLog?.(`Glossary scan attempt with ${model} failed: ${(err as Error).message}. Switching models...`, 'WARNING');
      }
    }

    const allScanModelsHitQuota = scanAttempts.length > 0 && scanAttempts.every(a => a.isQuota);
    return {
      terms: [],
      succeeded: false,
      quotaExhausted: allScanModelsHitQuota,
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
    const liveModelsToTry = ['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

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
    const getNormalizedTags = (str: string) => {
      // Strip internal annotation spans like class="isolated-refusal" before comparing structural tags
      const cleanedStr = str.replace(/<span class="isolated-refusal"[^>]*>([\s\S]*?)<\/span>/gi, '$1');
      // Matches opening and closing HTML tags: e.g. <p>, </div>, <span class="...">
      const matches = cleanedStr.match(/<\/?([a-zA-Z0-9]+)[^>]*>/g) || [];
      return matches
        .map(rawTag => {
          const isClosing = rawTag.startsWith('</');
          const nameMatch = rawTag.match(/<\/?([a-zA-Z0-9]+)/);
          const name = nameMatch ? nameMatch[1].toLowerCase() : '';
          return isClosing ? `</${name}>` : `<${name}>`;
        })
        .sort();
    };

    const originalTags = getNormalizedTags(original);
    const translatedTags = getNormalizedTags(translated);

    if (originalTags.length !== translatedTags.length) {
      const msg = `Tag count mismatch. Expected: ${originalTags.length} tags, Received: ${translatedTags.length} tags`;
      console.warn(msg, { originalTags, translatedTags });
      onLog?.("Integrity check warning: Tag count mismatch", 'WARNING', {
        message: msg,
        expectedTagsCount: originalTags.length,
        receivedTagsCount: translatedTags.length,
        originalSample: originalTags.slice(0, 8),
        translatedSample: translatedTags.slice(0, 8)
      });
      return false;
    }

    for (let i = 0; i < originalTags.length; i++) {
      if (originalTags[i] !== translatedTags[i]) {
        const msg = `Tag mismatch at position ${i}: Expected ${originalTags[i]} but received ${translatedTags[i]}`;
        console.warn(msg);
        onLog?.("Integrity check warning: Tag structure mismatch", 'WARNING', { message: msg });
        return false;
      }
    }

    return true;
  }
};
