import { FontRecommendation } from '../types';

export interface CatalogFont {
  fontFamily: string;
  kebabName: string;
  category: 'serif' | 'sans-serif' | 'display' | 'monospace' | 'handwriting';
  language: 'ar' | 'en' | 'all';
  subset: string;
  weights: number[];
  recommendedRoles: ('body' | 'heading' | 'subheading' | 'quote' | 'code')[];
  description: string;
  sampleArabic?: string;
  sampleLatin?: string;
}

export const CURATED_FONTS: CatalogFont[] = [
  // --- Arabic Curated Fonts ---
  {
    fontFamily: 'Amiri',
    kebabName: 'amiri',
    category: 'serif',
    language: 'ar',
    subset: 'arabic',
    weights: [400, 700],
    recommendedRoles: ['body', 'heading', 'quote'],
    description: 'Classic Naskh typeface designed for literary, traditional, and historical books with exceptional diacritics.',
    sampleArabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ — كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ مُبَارَكٌ',
  },
  {
    fontFamily: 'Scheherazade New',
    kebabName: 'scheherazade-new',
    category: 'serif',
    language: 'ar',
    subset: 'arabic',
    weights: [400, 700],
    recommendedRoles: ['body', 'quote'],
    description: 'Traditional Arabic Naskh script optimized for long narrative reading and classical manuscripts.',
    sampleArabic: 'إن القراءة تمنح الإنسان أكثر من حياة واحدة في عمر واحد.',
  },
  {
    fontFamily: 'Cairo',
    kebabName: 'cairo',
    category: 'sans-serif',
    language: 'ar',
    subset: 'arabic',
    weights: [300, 400, 600, 700],
    recommendedRoles: ['body', 'heading', 'subheading'],
    description: 'Modern, crisp geometric Sans-serif designed specifically for digital reading and editorial hierarchy.',
    sampleArabic: 'الأفكار تولد وتنمو من خلال الكلمات الصادقة والتصميم المتقن.',
  },
  {
    fontFamily: 'Noto Sans Arabic',
    kebabName: 'noto-sans-arabic',
    category: 'sans-serif',
    language: 'ar',
    subset: 'arabic',
    weights: [400, 500, 700],
    recommendedRoles: ['body', 'subheading'],
    description: 'Universal, ultra-clean Google typeface ensuring neutral legibility across every screen and e-reader.',
    sampleArabic: 'المعرفة نور يضيء دروب الإنسانية نحو مستقبل أكثر إشراقاً.',
  },
  {
    fontFamily: 'Noto Naskh Arabic',
    kebabName: 'noto-naskh-arabic',
    category: 'serif',
    language: 'ar',
    subset: 'arabic',
    weights: [400, 700],
    recommendedRoles: ['body', 'quote'],
    description: 'Balanced contemporary Naskh font optimized for high clarity and comfortable reading in body paragraphs.',
    sampleArabic: 'في قلب كل حكاية سر ينتظر من يكتشفه ويفك شفراته.',
  },
  {
    fontFamily: 'IBM Plex Sans Arabic',
    kebabName: 'ibm-plex-sans-arabic',
    category: 'sans-serif',
    language: 'ar',
    subset: 'arabic',
    weights: [300, 400, 600, 700],
    recommendedRoles: ['body', 'heading', 'subheading'],
    description: 'Sophisticated neo-grotesque Arabic typeface blending engineered precision with organic Arabic calligraphic roots.',
    sampleArabic: 'الهندسة والتصميم يلتقيان ليخلقا تجربة قراءة فريدة وسلسة.',
  },
  {
    fontFamily: 'Tajawal',
    kebabName: 'tajawal',
    category: 'sans-serif',
    language: 'ar',
    subset: 'arabic',
    weights: [300, 400, 500, 700],
    recommendedRoles: ['body', 'subheading'],
    description: 'Gentle, modern sans-serif with subtle rounded terminals, very comfortable for sustained reading.',
    sampleArabic: 'تتحدث الصفحات بصمت عميق يتردد صداه في وجدان القارئ.',
  },
  {
    fontFamily: 'Almarai',
    kebabName: 'almarai',
    category: 'sans-serif',
    language: 'ar',
    subset: 'arabic',
    weights: [300, 400, 700],
    recommendedRoles: ['heading', 'subheading'],
    description: 'Clean, polished corporate sans-serif favored for modern non-fiction and technical essays.',
    sampleArabic: 'تنظيم الفصول وهيكلة المحتوى أساس جودة الكتاب الرقمي.',
  },
  {
    fontFamily: 'Lateef',
    kebabName: 'lateef',
    category: 'handwriting',
    language: 'ar',
    subset: 'arabic',
    weights: [400, 700],
    recommendedRoles: ['quote', 'body'],
    description: 'Elegant Nastaliq and Sindhi influenced Arabic script with fluid, graceful character connections.',
    sampleArabic: '«وما نيل المطالب بالتمني ولكن تؤخذ الدنيا غلابا»',
  },
  {
    fontFamily: 'Changa',
    kebabName: 'changa',
    category: 'display',
    language: 'ar',
    subset: 'arabic',
    weights: [400, 600, 700],
    recommendedRoles: ['heading'],
    description: 'Bold, punchy geometric display font ideal for book titles, dramatic chapter openers, and posters.',
    sampleArabic: 'الفصل الأول: البدايات الجديدة والمغامرة الكبرى',
  },
  {
    fontFamily: 'Aref Ruqaa',
    kebabName: 'aref-ruqaa',
    category: 'display',
    language: 'ar',
    subset: 'arabic',
    weights: [400, 700],
    recommendedRoles: ['heading', 'quote'],
    description: 'Expressive Ruq\'ah style Arabic font rooted in traditional calligraphy, perfect for poetic and classical headings.',
    sampleArabic: '«إذا غامَرْتَ في شَرَفٍ مَرُومِ فَلا تَقنَعْ بما دُونَ النّجُومِ»',
  },
  {
    fontFamily: 'Alexandria',
    kebabName: 'alexandria',
    category: 'sans-serif',
    language: 'ar',
    subset: 'arabic',
    weights: [300, 400, 600, 700],
    recommendedRoles: ['body', 'heading'],
    description: 'Contemporary multi-weight sans-serif designed for modern Arab typography and high-density screens.',
    sampleArabic: 'وضوح الخط وجمال السطور ينعشان الروح قبل العيون.',
  },
  {
    fontFamily: 'Readex Pro',
    kebabName: 'readex-pro',
    category: 'sans-serif',
    language: 'ar',
    subset: 'arabic',
    weights: [300, 400, 600, 700],
    recommendedRoles: ['body', 'subheading'],
    description: 'Carefully engineered typeface for optimal reading velocity and optical clarity.',
    sampleArabic: 'سهولة القراءة تقلل من إجهاد العين في الجلسات الطويلة.',
  },

  // --- Latin / English Curated Fonts ---
  {
    fontFamily: 'Merriweather',
    kebabName: 'merriweather',
    category: 'serif',
    language: 'en',
    subset: 'latin',
    weights: [300, 400, 700],
    recommendedRoles: ['body', 'quote'],
    description: 'Crafted specifically to be a workhorse text typeface that is pleasant to read at small sizes on screens.',
    sampleLatin: 'The quick brown fox jumps over the lazy dog. A true masterpiece of modern typography.',
  },
  {
    fontFamily: 'Lora',
    kebabName: 'lora',
    category: 'serif',
    language: 'en',
    subset: 'latin',
    weights: [400, 500, 600, 700],
    recommendedRoles: ['body', 'quote', 'heading'],
    description: 'Well-balanced contemporary serif with roots in calligraphy, ideal for artistic and narrative literature.',
    sampleLatin: 'Memory is a net; one finds it full of fish when he takes it from the brook.',
  },
  {
    fontFamily: 'EB Garamond',
    kebabName: 'eb-garamond',
    category: 'serif',
    language: 'en',
    subset: 'latin',
    weights: [400, 600, 700],
    recommendedRoles: ['body', 'heading'],
    description: 'Faithful revival of Claude Garamond’s famous 16th-century humanist book typeface.',
    sampleLatin: 'Classic elegance for historical, philosophical, and classic literature.',
  },
  {
    fontFamily: 'Libre Baskerville',
    kebabName: 'libre-baskerville',
    category: 'serif',
    language: 'en',
    subset: 'latin',
    weights: [400, 700],
    recommendedRoles: ['body', 'heading'],
    description: 'Web font based on the American Type Founders Baskerville with taller x-height and softer contrast.',
    sampleLatin: 'To read without reflecting is like eating without digesting.',
  },
  {
    fontFamily: 'Playfair Display',
    kebabName: 'playfair-display',
    category: 'display',
    language: 'en',
    subset: 'latin',
    weights: [400, 600, 700],
    recommendedRoles: ['heading'],
    description: 'High-contrast transitional display serif influenced by John Baskerville and European Enlightenment presses.',
    sampleLatin: 'Chapter I: The Architecture of Timeless Books',
  },
  {
    fontFamily: 'Cinzel',
    kebabName: 'cinzel',
    category: 'display',
    language: 'en',
    subset: 'latin',
    weights: [400, 600, 700],
    recommendedRoles: ['heading'],
    description: 'Inspired by first century Roman inscriptions, perfect for monumental and epic titles.',
    sampleLatin: 'CHRONICLES OF ANCIENT WISDOM',
  },
  {
    fontFamily: 'Inter',
    kebabName: 'inter',
    category: 'sans-serif',
    language: 'en',
    subset: 'latin',
    weights: [300, 400, 500, 700],
    recommendedRoles: ['body', 'subheading'],
    description: 'Carefully crafted for computer screens, with tall x-height to aid in reading mixed-case and small text.',
    sampleLatin: 'Technical documentation, modern guides, and crisp UI layouts.',
  },
  {
    fontFamily: 'Roboto',
    kebabName: 'roboto',
    category: 'sans-serif',
    language: 'en',
    subset: 'latin',
    weights: [300, 400, 500, 700],
    recommendedRoles: ['body', 'subheading'],
    description: 'Dual nature font featuring mechanical skeleton and largely geometric forms with friendly open curves.',
    sampleLatin: 'Clean, universal, and highly legible across all digital devices.',
  },
  {
    fontFamily: 'JetBrains Mono',
    kebabName: 'jetbrains-mono',
    category: 'monospace',
    language: 'all',
    subset: 'latin',
    weights: [400, 700],
    recommendedRoles: ['code'],
    description: 'Engineered for developers and code blocks, featuring increased character heights and clear ligatures.',
    sampleLatin: 'const formatBook = (epub: Book) => epub.render();',
  },
  {
    fontFamily: 'Source Code Pro',
    kebabName: 'source-code-pro',
    category: 'monospace',
    language: 'all',
    subset: 'latin',
    weights: [400, 600],
    recommendedRoles: ['code'],
    description: 'Monospaced typeface designed specifically for coding environments and technical terminal outputs.',
    sampleLatin: 'printf("EPUB Architect Typography Engine\\n");',
  },
];

/**
 * Returns a list of curated fonts appropriate for the book's language and RTL setting.
 */
export const getCuratedFontsForLanguage = (isRTL: boolean, detectedLanguage?: string): CatalogFont[] => {
  const isArabic = isRTL || (detectedLanguage && detectedLanguage.toLowerCase().startsWith('ar'));
  if (isArabic) {
    return CURATED_FONTS.filter(f => f.language === 'ar' || f.language === 'all');
  }
  return CURATED_FONTS.filter(f => f.language === 'en' || f.language === 'all');
};

/**
 * Derives a kebab-case package name from any font family name string
 * e.g. "Scheherazade New" -> "scheherazade-new"
 *      "Noto Sans Arabic" -> "noto-sans-arabic"
 */
export const toKebabCase = (str: string): string => {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

/**
 * Creates a valid FontRecommendation object for a given role and family name.
 */
export const createFontRecommendation = (
  role: 'body' | 'heading' | 'subheading' | 'quote' | 'code',
  fontFamily: string,
  isRTL: boolean,
  category?: 'serif' | 'sans-serif' | 'display' | 'monospace' | 'handwriting',
  justification?: string
): FontRecommendation => {
  const kebab = toKebabCase(fontFamily);
  const subset = isRTL ? 'arabic' : 'latin';

  // Find in curated catalog if available
  const existing = CURATED_FONTS.find(f => f.fontFamily.toLowerCase() === fontFamily.toLowerCase());

  return {
    role,
    fontFamily: existing ? existing.fontFamily : fontFamily.trim(),
    kebabName: existing ? existing.kebabName : kebab,
    category: category || (existing ? existing.category : (role === 'code' ? 'monospace' : 'serif')),
    subset: existing ? existing.subset : subset,
    justification: justification || `User selected custom font for ${role}.`,
    isCustomOverride: true,
  };
};

// Keeps track of injected Google Fonts into the DOM head for live preview
const loadedPreviewFonts = new Set<string>();

/**
 * Injects a Google Font stylesheet link into document.head so the font renders
 * live in the UI preview immediately.
 */
export const ensureFontLoadedInDOM = (fontFamily: string) => {
  if (typeof document === 'undefined') return;
  if (loadedPreviewFonts.has(fontFamily)) return;

  try {
    const formattedFamily = fontFamily.trim().replace(/ /g, '+');
    const linkId = `gfont-${toKebabCase(fontFamily)}`;
    if (document.getElementById(linkId)) {
      loadedPreviewFonts.add(fontFamily);
      return;
    }

    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${formattedFamily}:ital,wght@0,400;0,600;0,700;1,400&display=swap`;
    document.head.appendChild(link);
    loadedPreviewFonts.add(fontFamily);
  } catch (e) {
    console.warn('Failed to load Google Font for preview:', fontFamily, e);
  }
};
