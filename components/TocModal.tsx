import React, { useState } from 'react';
import { Modal, Button, Input, Spinner } from './ui';
import { TocItem, GlossaryTerm } from '../types';
import { Wand2, Save, ArrowUpRight, Check, ListTree, BookMarked, Sparkles } from 'lucide-react';
import { geminiService } from '../services/geminiService';

interface TocModalProps {
  isOpen: boolean;
  onClose: () => void;
  toc: TocItem[];
  bookTitle?: string;
  glossary?: GlossaryTerm[];
  onSaveToc: (updatedToc: TocItem[]) => Promise<void>;
  onJumpToSegment: (segmentIndex: number) => void;
  onTermsDiscovered?: (newTerms: GlossaryTerm[]) => Promise<void> | void;
  addLog?: (msg: string, type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR') => void;
}

interface TranslationFeedback {
  enforcedCount: number;
  discoveredTerms: GlossaryTerm[];
}

export const TocModal: React.FC<TocModalProps> = ({
  isOpen,
  onClose,
  toc,
  bookTitle,
  glossary = [],
  onSaveToc,
  onJumpToSegment,
  onTermsDiscovered,
  addLog,
}) => {
  const [localToc, setLocalToc] = useState<TocItem[]>(toc);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [translationFeedback, setTranslationFeedback] = useState<TranslationFeedback | null>(null);

  // Sync state when opened
  React.useEffect(() => {
    if (isOpen) {
      setLocalToc(JSON.parse(JSON.stringify(toc)));
      setSavedSuccess(false);
      setTranslationFeedback(null);
    }
  }, [isOpen, toc]);

  const updateArabicTitle = (id: string, newArabicTitle: string) => {
    const updateRecursive = (items: TocItem[]): TocItem[] => {
      return items.map(item => {
        if (item.id === id) {
          return { ...item, arabicTitle: newArabicTitle };
        }
        if (item.subItems && item.subItems.length > 0) {
          return { ...item, subItems: updateRecursive(item.subItems) };
        }
        return item;
      });
    };

    setLocalToc(prev => updateRecursive(prev));
  };

  const handleTranslateAll = async () => {
    setIsTranslating(true);
    setTranslationFeedback(null);
    addLog?.("Translating Table of Contents titles with AI and glossary enforcement...", 'INFO');

    try {
      // Flatten all items
      const flatItems: { id: string; title: string }[] = [];
      const collect = (items: TocItem[]) => {
        for (const it of items) {
          flatItems.push({ id: it.id, title: it.title });
          if (it.subItems) collect(it.subItems);
        }
      };
      collect(localToc);

      const result = await geminiService.translateTocTitles(
        flatItems,
        bookTitle,
        (msg, type) => addLog?.(msg, type),
        glossary
      );

      const applyTranslations = (items: TocItem[]): TocItem[] => {
        return items.map(item => {
          const trans = result.translatedTitles[item.id];
          const updated = trans ? { ...item, arabicTitle: trans } : item;
          if (updated.subItems && updated.subItems.length > 0) {
            updated.subItems = applyTranslations(updated.subItems);
          }
          return updated;
        });
      };

      const updated = applyTranslations(localToc);
      setLocalToc(updated);

      if (result.discoveredTerms && result.discoveredTerms.length > 0) {
        await onTermsDiscovered?.(result.discoveredTerms);
      }

      setTranslationFeedback({
        enforcedCount: result.enforcedTermCount,
        discoveredTerms: result.discoveredTerms || []
      });

      const termMsg = result.enforcedTermCount > 0 ? ` (${result.enforcedTermCount} glossary terms enforced)` : '';
      const newTermsMsg = result.discoveredTerms?.length > 0 ? ` and harvested ${result.discoveredTerms.length} new glossary terms` : '';
      addLog?.(`Successfully translated ${Object.keys(result.translatedTitles).length} chapter titles${termMsg}${newTermsMsg}.`, 'SUCCESS');
    } catch (err: any) {
      addLog?.(`Failed to translate chapter titles: ${err.message}`, 'ERROR');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveToc(localToc);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 600);
    } catch (err: any) {
      addLog?.(`Failed to save Table of Contents: ${err.message}`, 'ERROR');
    } finally {
      setIsSaving(false);
    }
  };

  const renderRows = (items: TocItem[], level: number = 0): React.ReactNode => {
    return items.map((item, idx) => {
      // Find glossary terms matching this chapter title
      const titleLower = item.title.toLowerCase();
      const matchingTerms = glossary.filter(g => {
        const src = g.source.toLowerCase();
        return src.length >= 2 && titleLower.includes(src);
      });

      return (
        <React.Fragment key={item.id || idx}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 py-3 border-b border-slate-100 dark:border-slate-800 items-start hover:bg-slate-50/50 dark:hover:bg-slate-800/40 px-2 rounded-lg transition-colors">
            {/* Original Title */}
            <div className="md:col-span-5 flex flex-col gap-1 min-w-0" style={{ paddingLeft: `${level * 16}px` }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                  #{item.segmentIndex + 1}
                </span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate" title={item.title}>
                  {item.title}
                </span>
              </div>

              {/* Matching Glossary Hints */}
              {matchingTerms.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pl-6">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                    <BookMarked className="w-2.5 h-2.5 text-sky-500" />
                    Glossary:
                  </span>
                  {matchingTerms.slice(0, 3).map(term => (
                    <button
                      key={term.id}
                      type="button"
                      onClick={() => {
                        if (!item.arabicTitle) {
                          updateArabicTitle(item.id, term.target);
                        } else if (!item.arabicTitle.includes(term.target)) {
                          updateArabicTitle(item.id, `${item.arabicTitle} - ${term.target}`);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 hover:border-sky-400 transition-colors"
                      title={`Click to inject "${term.target}" into translation`}
                    >
                      <span className="font-mono text-[9px]">{term.source}</span>
                      <span className="text-sky-400 font-sans">➔</span>
                      <span className="font-arabic font-medium">{term.target}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Arabic Title Input */}
            <div className="md:col-span-5">
              <Input
                value={item.arabicTitle || ''}
                onChange={(e) => updateArabicTitle(item.id, e.target.value)}
                placeholder="العنوان بالعربية..."
                dir="rtl"
                className="text-sm font-arabic h-9"
              />
            </div>

            {/* Jump Action */}
            <div className="md:col-span-2 flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onJumpToSegment(item.segmentIndex);
                  onClose();
                }}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400 text-slate-600 dark:text-slate-400 transition-colors inline-flex items-center gap-1"
                title={`Jump to segment ${item.segmentIndex + 1}`}
              >
                <span>Jump</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {item.subItems && item.subItems.length > 0 && renderRows(item.subItems, level + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Table of Contents Translation & Sync"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Intro Banner */}
        <div className="bg-sky-50 dark:bg-sky-950/40 p-3.5 rounded-lg border border-sky-100 dark:border-sky-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sky-900 dark:text-sky-200 text-sm">
            <ListTree className="w-4 h-4 text-sky-500 shrink-0" />
            <div className="space-y-0.5">
              <p>
                Synchronize chapter titles for reader navigation. Translated titles are embedded in <code>nav.xhtml</code> and <code>toc.ncx</code> upon export.
              </p>
              {glossary.length > 0 && (
                <p className="text-xs text-sky-700 dark:text-sky-300 font-medium flex items-center gap-1">
                  <BookMarked className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Enforcing {glossary.length} established terms from the project glossary.</span>
                </p>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleTranslateAll}
            disabled={isTranslating}
            className="shrink-0 bg-white dark:bg-slate-800 text-xs font-medium shadow-sm hover:border-sky-400"
            title={glossary.length > 0 ? `Auto-translate honoring ${glossary.length} project glossary terms` : 'Auto-translate all chapter titles'}
          >
            {isTranslating ? (
              <>
                <Spinner className="w-3.5 h-3.5 mr-1.5" />
                Translating...
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5 mr-1.5 text-sky-500" />
                Auto-Translate All
              </>
            )}
          </Button>
        </div>

        {/* Glossary Feedback Banner */}
        {translationFeedback && (
          <div className="bg-emerald-50/90 dark:bg-emerald-950/40 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-200">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>
                  {translationFeedback.enforcedCount > 0
                    ? `Enforced ${translationFeedback.enforcedCount} glossary term(s) for naming consistency`
                    : 'Chapter titles successfully translated'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTranslationFeedback(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[11px]"
              >
                Dismiss
              </button>
            </div>

            {translationFeedback.discoveredTerms.length > 0 && (
              <div className="pt-1.5 border-t border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-2 flex-wrap text-[11px]">
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                  Automatically added to glossary:
                </span>
                {translationFeedback.discoveredTerms.map((t, idx) => (
                  <span
                    key={t.id || idx}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700/80 text-slate-700 dark:text-slate-200 font-mono text-[10px]"
                    title={`${t.source} ➔ ${t.target} (${t.category})`}
                  >
                    <span>{t.source}</span>
                    <span className="text-emerald-500 font-sans">➔</span>
                    <span className="font-arabic font-medium">{t.target}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Table Header */}
        <div className="hidden md:grid grid-cols-12 gap-3 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-700">
          <div className="col-span-5">Source Chapter Title</div>
          <div className="col-span-5">Arabic Title (العنوان بالعربية)</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* Chapters List */}
        <div className="max-h-[55vh] overflow-y-auto custom-scrollbar pr-1 divide-y divide-slate-50 dark:divide-slate-800/50">
          {localToc && localToc.length > 0 ? (
            renderRows(localToc)
          ) : (
            <div className="py-12 text-center text-sm text-slate-400">
              No Table of Contents items detected.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {localToc.length} Chapter entries
          </span>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="min-w-[120px]"
            >
              {isSaving ? (
                <>
                  <Spinner className="w-3.5 h-3.5 mr-1.5" />
                  Saving...
                </>
              ) : savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
