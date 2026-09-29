import React, { useState, useEffect, useMemo } from 'react';
import { FontRecommendation } from '../types';
import { CURATED_FONTS, CatalogFont, getCuratedFontsForLanguage, ensureFontLoadedInDOM, createFontRecommendation } from '../services/fontRegistry';
import { X, Search, RotateCcw, Check, Sparkles, Eye, Info, Type, SlidersHorizontal } from 'lucide-react';

interface FontPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRecommendation: FontRecommendation;
  isRTL: boolean;
  detectedLanguage: string;
  onApplyFont: (updatedRecommendation: FontRecommendation) => void;
  onResetToOriginal?: () => void;
}

const ROLE_LABELS: Record<string, { title: string; targetElements: string; desc: string }> = {
  body: {
    title: 'Body Text Typography',
    targetElements: '<p>, <div>, <span>, <body>',
    desc: 'The primary typeface for chapter paragraphs and continuous reading.',
  },
  heading: {
    title: 'Main Headings Typography',
    targetElements: '<h1>, <h2>, <h3>',
    desc: 'Typeface applied to book title, chapter titles, and major divisions.',
  },
  subheading: {
    title: 'Subheadings Typography',
    targetElements: '<h4>, <h5>, <h6>',
    desc: 'Section headers, minor chapter dividers, and topic titles.',
  },
  quote: {
    title: 'Blockquotes & Epigraphs',
    targetElements: '<blockquote>, <q>, .quote',
    desc: 'Decorative or distinct typography for literary quotes and verse.',
  },
  code: {
    title: 'Monospace & Code',
    targetElements: '<pre>, <code>, <kbd>, <samp>',
    desc: 'Monospaced font for technical listings, formulas, and terminal text.',
  },
};

export const FontPickerModal: React.FC<FontPickerModalProps> = ({
  isOpen,
  onClose,
  currentRecommendation,
  isRTL,
  detectedLanguage,
  onApplyFont,
  onResetToOriginal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFont, setSelectedFont] = useState<string>(currentRecommendation.fontFamily);
  const [previewText, setPreviewText] = useState<string>('');
  const [previewSize, setPreviewSize] = useState<'sm' | 'md' | 'lg'>('md');

  // Load curated fonts matching book language
  const availableFonts = useMemo(() => {
    return getCuratedFontsForLanguage(isRTL, detectedLanguage);
  }, [isRTL, detectedLanguage]);

  // Default sample text based on language and role
  const defaultSample = useMemo(() => {
    if (isRTL) {
      if (currentRecommendation.role === 'heading') {
        return 'الفصل الأول: رحلة عبر الزمان والمكان';
      }
      if (currentRecommendation.role === 'quote') {
        return '«وما نيل المطالب بالتمني ولكن تؤخذ الدنيا غلابا»';
      }
      if (currentRecommendation.role === 'code') {
        return 'SELECT * FROM books WHERE lang = "ar";';
      }
      return 'تعتبر هندسة الكتب الرقمية فناً يجمع بين الدقة التقنية والجمال البصري لإثراء تجربة القارئ.';
    } else {
      if (currentRecommendation.role === 'heading') {
        return 'Chapter I: The Architecture of Thought';
      }
      if (currentRecommendation.role === 'quote') {
        return '“There is no friend as loyal as a book.” — Ernest Hemingway';
      }
      if (currentRecommendation.role === 'code') {
        return 'const epub = new Book({ typography: "clean" });';
      }
      return 'Digital typography is the art of balancing semantic structure, optical rhythm, and comfortable reading.';
    }
  }, [isRTL, currentRecommendation.role]);

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFont(currentRecommendation.fontFamily);
      setPreviewText(defaultSample);
      setSearchQuery('');
      setSelectedCategory('all');
      ensureFontLoadedInDOM(currentRecommendation.fontFamily);
    }
  }, [isOpen, currentRecommendation, defaultSample]);

  // Ensure selected font is loaded in browser for preview
  useEffect(() => {
    if (selectedFont) {
      ensureFontLoadedInDOM(selectedFont);
    }
  }, [selectedFont]);

  // Filtered fonts list
  const filteredFonts = useMemo(() => {
    return availableFonts.filter(font => {
      const matchesSearch =
        font.fontFamily.toLowerCase().includes(searchQuery.toLowerCase()) ||
        font.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        font.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = selectedCategory === 'all' || font.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [availableFonts, searchQuery, selectedCategory]);

  if (!isOpen) return null;

  const roleMeta = ROLE_LABELS[currentRecommendation.role] || {
    title: `${currentRecommendation.role.toUpperCase()} Font`,
    targetElements: currentRecommendation.role,
    desc: 'Customize typography for this role.',
  };

  const handleSelectFont = (font: CatalogFont) => {
    setSelectedFont(font.fontFamily);
    ensureFontLoadedInDOM(font.fontFamily);
  };

  const handleCustomSearchSelect = () => {
    if (!searchQuery.trim()) return;
    setSelectedFont(searchQuery.trim());
    ensureFontLoadedInDOM(searchQuery.trim());
  };

  const handleSave = () => {
    // Find if selected font exists in catalog
    const catalogMatch = availableFonts.find(
      f => f.fontFamily.toLowerCase() === selectedFont.trim().toLowerCase()
    );

    const updated = createFontRecommendation(
      currentRecommendation.role,
      selectedFont.trim(),
      isRTL,
      catalogMatch?.category || currentRecommendation.category,
      catalogMatch
        ? `Custom selection: ${catalogMatch.description}`
        : `User customized font to ${selectedFont.trim()}`
    );

    // Keep track of the original AI font if available
    updated.originalFontFamily = currentRecommendation.originalFontFamily || currentRecommendation.fontFamily;
    updated.originalKebabName = currentRecommendation.originalKebabName || currentRecommendation.kebabName;

    onApplyFont(updated);
    onClose();
  };

  const isCurrentSelectionDifferent = selectedFont.trim().toLowerCase() !== currentRecommendation.fontFamily.toLowerCase();
  const hasOverride = !!currentRecommendation.isCustomOverride;

  const previewSizes = {
    sm: 'text-sm leading-relaxed',
    md: 'text-base leading-relaxed',
    lg: 'text-xl leading-relaxed',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
              <Type className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {roleMeta.title}
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-full font-mono">
                  {currentRecommendation.role}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Target elements: <code className="text-indigo-600 dark:text-indigo-400 font-mono font-medium">{roleMeta.targetElements}</code> &bull; Fonts map and layout spacing remain untouched.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Live Preview Panel */}
          <div className="bg-gradient-to-b from-slate-50 to-slate-100/70 dark:from-slate-800/60 dark:to-slate-900/60 rounded-xl p-5 border border-slate-200 dark:border-slate-700/80 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Live Typography Preview: <strong className="text-indigo-600 dark:text-indigo-400 font-semibold">{selectedFont}</strong>
                </span>
              </div>

              {/* Preview Size Selector */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 shadow-sm">
                {(['sm', 'md', 'lg'] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => setPreviewSize(size)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md uppercase transition-colors ${
                      previewSize === size
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Editable Preview Box */}
            <div
              className={`p-5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-h-[90px] shadow-sm transition-all text-slate-800 dark:text-slate-100 ${previewSizes[previewSize]}`}
              style={{
                fontFamily: `'${selectedFont}', sans-serif, serif`,
                direction: isRTL ? 'rtl' : 'ltr',
              }}
            >
              {previewText}
            </div>

            <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Preview rendered using Google Fonts Web CDN</span>
              <button
                onClick={() => setPreviewText(defaultSample)}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 underline underline-offset-2"
              >
                Reset preview text
              </button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search font or type any Google Font name..."
                className="w-full pl-9 pr-24 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              />
              {searchQuery.trim() && (
                <button
                  onClick={handleCustomSearchSelect}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition-colors"
                >
                  Use This
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {[
                { id: 'all', label: 'All' },
                { id: 'serif', label: isRTL ? 'Serif / Naskh' : 'Serif' },
                { id: 'sans-serif', label: 'Sans-serif' },
                { id: 'display', label: isRTL ? 'Display / Ruq\'ah' : 'Display' },
                { id: 'monospace', label: 'Monospace' },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-2 text-xs font-medium rounded-xl whitespace-nowrap transition-all border ${
                    selectedCategory === cat.id
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Curated Font Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Curated Fonts for {isRTL ? 'Arabic' : 'Latin'} EPUBs
              </h4>
              <span className="text-xs text-slate-400">
                {filteredFonts.length} font{filteredFonts.length === 1 ? '' : 's'} available
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[280px] overflow-y-auto pr-1">
              {filteredFonts.map(font => {
                const isSelected = selectedFont.toLowerCase() === font.fontFamily.toLowerCase();
                const isAIOriginal = currentRecommendation.originalFontFamily
                  ? currentRecommendation.originalFontFamily.toLowerCase() === font.fontFamily.toLowerCase()
                  : currentRecommendation.fontFamily.toLowerCase() === font.fontFamily.toLowerCase();

                return (
                  <div
                    key={font.kebabName}
                    onClick={() => handleSelectFont(font)}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="font-bold text-base text-slate-900 dark:text-slate-100"
                            style={{ fontFamily: `'${font.fontFamily}', sans-serif, serif` }}
                          >
                            {font.fontFamily}
                          </span>
                          <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {font.category}
                          </span>
                          {isAIOriginal && (
                            <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                              AI Original
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-1">
                          {font.description}
                        </p>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-300 dark:border-slate-600 text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    </div>

                    {/* Font Preview Line */}
                    <div
                      className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-sm text-slate-700 dark:text-slate-200 truncate"
                      style={{
                        fontFamily: `'${font.fontFamily}', sans-serif, serif`,
                        direction: isRTL ? 'rtl' : 'ltr',
                      }}
                    >
                      {isRTL ? font.sampleArabic || font.fontFamily : font.sampleLatin || font.fontFamily}
                    </div>
                  </div>
                );
              })}

              {filteredFonts.length === 0 && (
                <div className="col-span-2 p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                    No curated font matching "{searchQuery}"
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
                    You can still use "{searchQuery}" as a custom Google Font!
                  </p>
                  <button
                    onClick={handleCustomSearchSelect}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                  >
                    Select "{searchQuery}" for {currentRecommendation.role}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {(hasOverride || (currentRecommendation.originalFontFamily && currentRecommendation.fontFamily !== currentRecommendation.originalFontFamily)) && onResetToOriginal && (
              <button
                onClick={() => {
                  onResetToOriginal();
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                Reset to AI Suggestion ({currentRecommendation.originalFontFamily || currentRecommendation.fontFamily})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Apply Font to {currentRecommendation.role}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
