import React, { useState, useMemo } from 'react';
import { Search, Plus, Trash2, Edit3, Check, X, Wand2, Replace, BookOpen } from 'lucide-react';
import { GlossaryTerm, GlossaryCategory, Segment } from '../types';
import { Modal, Button, Input, Spinner } from './ui';
import { normalizeGlossaryKey, countTextInHtmlNodes } from '../services/db';

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  glossary: GlossaryTerm[];
  segments: Segment[];
  isScanning: boolean;
  onScanBook: () => Promise<void>;
  onSaveTerm: (term: GlossaryTerm, oldTarget?: string) => Promise<void>;
  onDeleteTerm: (id: string) => Promise<void>;
  onReplaceAcrossSegments: (oldArabic: string, newArabic: string) => Promise<{ updatedSegmentsCount: number; replacementsCount: number }>;
}

const CATEGORIES: { value: 'all' | GlossaryCategory; label: string }[] = [
  { value: 'all', label: 'All Terms' },
  { value: 'character', label: 'Characters' },
  { value: 'location', label: 'Locations' },
  { value: 'title', label: 'Titles' },
  { value: 'concept', label: 'Concepts' },
];

export const GlossaryModal: React.FC<GlossaryModalProps> = ({
  isOpen,
  onClose,
  glossary,
  segments,
  isScanning,
  onScanBook,
  onSaveTerm,
  onDeleteTerm,
  onReplaceAcrossSegments,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | GlossaryCategory>('all');

  // Add New Term state
  const [isAdding, setIsAdding] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCategory, setNewCategory] = useState<GlossaryCategory>('concept');
  const [newNotes, setNewNotes] = useState('');

  // Inline Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editCategory, setEditCategory] = useState<GlossaryCategory>('concept');
  const [editNotes, setEditNotes] = useState('');
  const [originalTargetBeforeEdit, setOriginalTargetBeforeEdit] = useState('');

  // Pending One-Click Global Find & Replace prompt after editing a term
  const [pendingReplace, setPendingReplace] = useState<{
    sourceTerm: string;
    oldArabic: string;
    newArabic: string;
    matchingSegmentsCount: number;
    totalOccurrences: number;
  } | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceSuccessBanner, setReplaceSuccessBanner] = useState<string | null>(null);

  // Manual Find & Replace bar state
  const [showManualReplaceBar, setShowManualReplaceBar] = useState(false);
  const [manualFindArabic, setManualFindArabic] = useState('');
  const [manualReplaceArabic, setManualReplaceArabic] = useState('');

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: glossary.length,
      character: 0,
      location: 0,
      title: 0,
      concept: 0,
    };
    for (const term of glossary) {
      if (!term?.category) continue;
      counts[term.category] = (counts[term.category] || 0) + 1;
    }
    return counts;
  }, [glossary]);

  const filteredTerms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return glossary.filter((term) => {
      if (!term?.source || !term?.target) return false;
      if (activeCategory !== 'all' && term.category !== activeCategory) return false;
      if (!q) return true;
      return (
        term.source.toLowerCase().includes(q) ||
        term.target.toLowerCase().includes(q) ||
        (term.notes && term.notes.toLowerCase().includes(q))
      );
    });
  }, [glossary, activeCategory, searchQuery]);

  // Count how many translated segments contain a given Arabic string in text nodes
  const computeArabicOccurrences = (arabicText: string) => {
    const trimmed = arabicText.trim();
    if (!trimmed) return { matchingSegmentsCount: 0, totalOccurrences: 0 };
    let matchingSegmentsCount = 0;
    let totalOccurrences = 0;

    for (const seg of segments) {
      if (seg.translatedHtml && seg.translatedHtml.includes(trimmed)) {
        const count = countTextInHtmlNodes(seg.translatedHtml, trimmed);
        if (count > 0) {
          matchingSegmentsCount += 1;
          totalOccurrences += count;
        }
      }
    }
    return { matchingSegmentsCount, totalOccurrences };
  };

  const manualFindStats = useMemo(
    () => computeArabicOccurrences(manualFindArabic),
    [manualFindArabic, segments]
  );

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSource.trim() || !newTarget.trim()) return;

    const term: GlossaryTerm = {
      id: normalizeGlossaryKey(newSource),
      source: newSource.trim(),
      target: newTarget.trim(),
      category: newCategory,
      notes: newNotes.trim() || undefined,
      sourceType: 'manual',
      createdAt: Date.now(),
    };

    await onSaveTerm(term);
    setNewSource('');
    setNewTarget('');
    setNewNotes('');
    setIsAdding(false);
  };

  const startEditing = (term: GlossaryTerm) => {
    setEditingId(term.id);
    setEditSource(term.source);
    setEditTarget(term.target);
    setEditCategory(term.category);
    setEditNotes(term.notes || '');
    setOriginalTargetBeforeEdit(term.target);
    setReplaceSuccessBanner(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setOriginalTargetBeforeEdit('');
  };

  const saveEditing = async (term: GlossaryTerm) => {
    const trimmedSource = editSource.trim();
    const trimmedTarget = editTarget.trim();
    if (!trimmedSource || !trimmedTarget) return;

    const updatedTerm: GlossaryTerm = {
      ...term,
      id: normalizeGlossaryKey(trimmedSource),
      source: trimmedSource,
      target: trimmedTarget,
      category: editCategory,
      notes: editNotes.trim() || undefined,
      sourceType: 'manual',
    };

    await onSaveTerm(updatedTerm, originalTargetBeforeEdit);
    setEditingId(null);

    // Check if the previous Arabic translation exists in already-translated segments
    if (originalTargetBeforeEdit && originalTargetBeforeEdit !== trimmedTarget) {
      const stats = computeArabicOccurrences(originalTargetBeforeEdit);
      if (stats.totalOccurrences > 0) {
        setPendingReplace({
          sourceTerm: trimmedSource,
          oldArabic: originalTargetBeforeEdit,
          newArabic: trimmedTarget,
          matchingSegmentsCount: stats.matchingSegmentsCount,
          totalOccurrences: stats.totalOccurrences,
        });
      }
    }
  };

  const executePendingReplace = async () => {
    if (!pendingReplace) return;
    setIsReplacing(true);
    try {
      const res = await onReplaceAcrossSegments(pendingReplace.oldArabic, pendingReplace.newArabic);
      setReplaceSuccessBanner(
        `Replaced ${res.replacementsCount} occurrence(s) of "${pendingReplace.oldArabic}" with "${pendingReplace.newArabic}" across ${res.updatedSegmentsCount} translated segment(s).`
      );
      setPendingReplace(null);
    } finally {
      setIsReplacing(false);
    }
  };

  const executeManualReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    const oldAr = manualFindArabic.trim();
    const newAr = manualReplaceArabic.trim();
    if (!oldAr || !newAr || oldAr === newAr) return;

    setIsReplacing(true);
    try {
      const res = await onReplaceAcrossSegments(oldAr, newAr);
      setReplaceSuccessBanner(
        `Replaced ${res.replacementsCount} occurrence(s) of "${oldAr}" with "${newAr}" across ${res.updatedSegmentsCount} translated segment(s).`
      );
      setManualFindArabic('');
      setManualReplaceArabic('');
      setShowManualReplaceBar(false);
    } finally {
      setIsReplacing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Book Terminology & Consistency Glossary"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Top Summary & Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Terms in this glossary are automatically matched per segment and enforced during translation.
            <span className="ml-2 font-mono tabular-nums text-slate-900 dark:text-slate-200 font-semibold">
              {glossary.length} active terms
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowManualReplaceBar((v) => !v)}
              className="whitespace-nowrap"
            >
              <Replace className="w-3.5 h-3.5 mr-1.5" />
              Find & Replace
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onScanBook}
              disabled={isScanning}
              className="whitespace-nowrap"
            >
              {isScanning ? (
                <>
                  <Spinner className="w-3.5 h-3.5 mr-1.5 text-sky-500" />
                  Scanning Book...
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5 mr-1.5 text-sky-500" />
                  Auto-Scan Book
                </>
              )}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAdding((v) => !v)}
              className="whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Term
            </Button>
          </div>
        </div>

        {/* One-Click Global Find & Replace Prompt Banner (Triggered when editing a glossary term) */}
        {pendingReplace && (
          <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              <span className="font-semibold">Update already-translated segments?</span> Found{' '}
              <span className="font-mono tabular-nums font-semibold">{pendingReplace.totalOccurrences}</span>{' '}
              occurrence(s) of <span className="font-arabic font-semibold" dir="rtl">"{pendingReplace.oldArabic}"</span>{' '}
              across <span className="font-mono tabular-nums font-semibold">{pendingReplace.matchingSegmentsCount}</span>{' '}
              translated segment(s). Replace all with{' '}
              <span className="font-arabic font-semibold" dir="rtl">"{pendingReplace.newArabic}"</span>?
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingReplace(null)}
                disabled={isReplacing}
              >
                Skip
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={executePendingReplace}
                disabled={isReplacing}
                className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-900 whitespace-nowrap"
              >
                {isReplacing ? (
                  <>
                    <Spinner className="w-3.5 h-3.5 mr-1.5" /> Replacing...
                  </>
                ) : (
                  <>
                    <Replace className="w-3.5 h-3.5 mr-1.5" /> Replace in {pendingReplace.matchingSegmentsCount} Segments
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation Banner */}
        {replaceSuccessBanner && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-300">
            <span>{replaceSuccessBanner}</span>
            <button
              onClick={() => setReplaceSuccessBanner(null)}
              className="text-emerald-600 dark:text-emerald-400 hover:opacity-80 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Direct Arabic Find & Replace Bar */}
        {showManualReplaceBar && (
          <form
            onSubmit={executeManualReplace}
            className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Global Arabic Find & Replace Across Translated Segments
              </span>
              <button
                type="button"
                onClick={() => setShowManualReplaceBar(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  Find existing Arabic word/phrase in translated segments
                </label>
                <Input
                  value={manualFindArabic}
                  onChange={(e) => setManualFindArabic(e.target.value)}
                  placeholder="e.g. الحارس"
                  dir="rtl"
                  className="h-9 text-sm font-arabic"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  Replace with new Arabic word/phrase
                </label>
                <Input
                  value={manualReplaceArabic}
                  onChange={(e) => setManualReplaceArabic(e.target.value)}
                  placeholder="e.g. الوصي"
                  dir="rtl"
                  className="h-9 text-sm font-arabic"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {manualFindArabic.trim()
                  ? `${manualFindStats.totalOccurrences} match(es) across ${manualFindStats.matchingSegmentsCount} translated segment(s)`
                  : 'Enter an Arabic word above to preview matches'}
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={
                  isReplacing ||
                  !manualFindArabic.trim() ||
                  !manualReplaceArabic.trim() ||
                  manualFindStats.totalOccurrences === 0
                }
              >
                {isReplacing ? <Spinner className="w-3.5 h-3.5 mr-1.5" /> : <Replace className="w-3.5 h-3.5 mr-1.5" />}
                Replace All ({manualFindStats.totalOccurrences})
              </Button>
            </div>
          </form>
        )}

        {/* Add New Term Form */}
        {isAdding && (
          <form
            onSubmit={handleAddSubmit}
            className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Add Custom Glossary Term
              </span>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  English Term
                </label>
                <Input
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="e.g. High Warden"
                  className="h-9 text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  Arabic Translation
                </label>
                <Input
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="e.g. الحارس الأعلى"
                  dir="rtl"
                  className="h-9 text-sm font-arabic"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as GlossaryCategory)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-50"
                >
                  <option value="character">Character</option>
                  <option value="location">Location</option>
                  <option value="title">Title</option>
                  <option value="concept">Concept</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  Notes (Optional)
                </label>
                <Input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Masculine singular"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save Term
              </Button>
            </div>
          </form>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Interactive Segmented Category Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setActiveCategory(cat.value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {cat.label}{' '}
                  <span className="font-mono tabular-nums opacity-70 ml-1">
                    ({categoryCounts[cat.value] || 0})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Live Search Input */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search English or Arabic..."
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {/* High-Density Glossary Table */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
          {isScanning && glossary.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <Spinner className="w-8 h-8 text-sky-500 mb-3" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Scanning book chapters to build your terminology glossary...
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                Extracting recurring character names, locations, titles, and key concepts so every chapter uses consistent Arabic translations.
              </p>
            </div>
          ) : filteredTerms.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4">
              <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {glossary.length === 0 ? 'No glossary terms extracted yet' : 'No matching glossary terms'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                {glossary.length === 0
                  ? 'Click "Auto-Scan Book" above or simply press "Start Translation" — Mutarjim Pro will automatically build and enforce the glossary for you.'
                  : 'Try clearing your search filter or switching categories.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-700/60">
              <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                <div className="col-span-4">Source Term (EN)</div>
                <div className="col-span-4 text-right">Canonical Arabic (AR)</div>
                <div className="col-span-3">Metadata & Notes</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>

              {filteredTerms.map((term) => {
                const isEditing = editingId === term.id;

                if (isEditing) {
                  return (
                    <div
                      key={term.id}
                      className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center bg-sky-50/40 dark:bg-sky-900/10"
                    >
                      <div className="col-span-3">
                        <Input
                          value={editSource}
                          onChange={(e) => setEditSource(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-4">
                        <Input
                          value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          dir="rtl"
                          className="h-8 text-xs font-arabic text-right"
                        />
                      </div>
                      <div className="col-span-2">
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value as GlossaryCategory)}
                          className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-50"
                        >
                          <option value="character">character</option>
                          <option value="location">location</option>
                          <option value="title">title</option>
                          <option value="concept">concept</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <Input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Notes..."
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => saveEditing(term)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 rounded"
                          title="Save changes"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={term.id}
                    className="grid grid-cols-12 gap-3 px-4 py-2.5 items-center hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors text-xs"
                  >
                    <div className="col-span-4 font-medium text-slate-900 dark:text-slate-100 truncate" title={term.source}>
                      {term.source}
                    </div>
                    <div
                      className="col-span-4 text-right font-arabic text-sm text-slate-900 dark:text-slate-100 truncate"
                      dir="rtl"
                      title={term.target}
                    >
                      {term.target}
                    </div>
                    <div className="col-span-3 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      <span>{term.category}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>
                        {term.sourceType === 'manual'
                          ? 'edited'
                          : term.sourceType === 'auto-live'
                          ? 'live'
                          : 'auto'}
                      </span>
                      {term.notes && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span title={term.notes}>{term.notes}</span>
                        </>
                      )}
                    </div>
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => startEditing(term)}
                        className="p-1.5 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        title="Edit translation"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTerm(term.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                        title="Remove from glossary"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
