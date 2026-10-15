import React, { useState, useMemo } from 'react';
import { ListTree, ChevronDown, ChevronRight, Search, Languages, CheckCircle2, CircleDashed } from 'lucide-react';
import { TocItem, Segment, SegmentStatus } from '../types';

interface ChapterDrawerProps {
  toc: TocItem[];
  segments: Segment[];
  activeSegmentIndex: number;
  onSelectSegment: (index: number) => void;
  onOpenTocModal: () => void;
}

interface FlattenedChapter {
  item: TocItem;
  nextSegmentIndex: number;
  totalSegments: number;
  translatedSegments: number;
  isComplete: boolean;
  isActive: boolean;
}

export const ChapterDrawer: React.FC<ChapterDrawerProps> = ({
  toc,
  segments,
  activeSegmentIndex,
  onSelectSegment,
  onOpenTocModal,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Flatten the TOC tree with calculated segment ranges and progress
  const flattenedChapters = useMemo(() => {
    const list: TocItem[] = [];
    const collect = (items: TocItem[]) => {
      for (const it of items) {
        list.push(it);
        if (it.subItems && it.subItems.length > 0) {
          collect(it.subItems);
        }
      }
    };
    collect(toc);

    // Preserve natural reading order of TOC and calculate chapter bounds
    return list.map((item, idx): FlattenedChapter => {
      const start = item.segmentIndex;
      const futureItems = list.slice(idx + 1).filter(other => other.segmentIndex > start);
      const end = futureItems.length > 0 ? futureItems[0].segmentIndex : segments.length;
      const chapterSegments = segments.slice(start, Math.max(start, end));
      const totalSegments = chapterSegments.length;
      const translatedSegments = chapterSegments.filter(s => s.status === SegmentStatus.TRANSLATED).length;
      const isComplete = totalSegments > 0 && translatedSegments === totalSegments;
      const isActive = activeSegmentIndex >= start && activeSegmentIndex < end;

      return {
        item,
        nextSegmentIndex: end,
        totalSegments,
        translatedSegments,
        isComplete,
        isActive,
      };
    });
  }, [toc, segments, activeSegmentIndex]);

  const filteredChapters = useMemo(() => {
    if (!searchQuery.trim()) return flattenedChapters;
    const q = searchQuery.toLowerCase();
    return flattenedChapters.filter(c => 
      c.item.title.toLowerCase().includes(q) || 
      (c.item.arabicTitle && c.item.arabicTitle.toLowerCase().includes(q))
    );
  }, [flattenedChapters, searchQuery]);

  if (!toc || toc.length === 0) return null;

  return (
    <div className="border border-slate-200 dark:border-slate-700/80 rounded-lg bg-white dark:bg-slate-800/90 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700/80 select-none">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-left flex-1 min-w-0 group"
          title={isExpanded ? 'Collapse Table of Contents' : 'Expand Table of Contents'}
        >
          <div className="p-1 rounded text-slate-500 group-hover:text-slate-800 dark:text-slate-400 dark:group-hover:text-slate-200 transition-colors">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <ListTree className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              Table of Contents
            </span>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
            ({flattenedChapters.length})
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenTocModal}
          className="p-1 rounded text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="Translate and Edit Chapter Titles"
        >
          <Languages className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-2 space-y-2">
          {/* Quick Filter */}
          {flattenedChapters.length > 6 && (
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chapters..."
                className="w-full pl-7 pr-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>
          )}

          {/* Chapters List */}
          <div className="max-h-64 overflow-y-auto space-y-1 custom-scrollbar pr-0.5">
            {filteredChapters.map((chapter, idx) => {
              const { item, totalSegments, translatedSegments, isComplete, isActive } = chapter;
              const hasArabic = Boolean(item.arabicTitle);

              return (
                <button
                  key={item.id || idx}
                  type="button"
                  onClick={() => onSelectSegment(item.segmentIndex)}
                  style={{ paddingLeft: `${Math.max(8, item.level * 10)}px` }}
                  className={`w-full text-left py-1.5 pr-2 rounded-md transition-all flex items-start gap-2 group ${
                    isActive
                      ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-100 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                  title={`${item.title}${item.arabicTitle ? ` | ${item.arabicTitle}` : ''} (Starts at Segment ${item.segmentIndex + 1})`}
                >
                  <div className="mt-0.5 shrink-0 text-slate-400">
                    {isComplete ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <CircleDashed className={`w-3 h-3 ${isActive ? 'text-sky-500' : 'text-slate-400'}`} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1.5">
                      <p className="text-xs truncate leading-snug">
                        {item.title}
                      </p>
                      <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                        {translatedSegments}/{totalSegments}
                      </span>
                    </div>

                    {hasArabic && (
                      <p className="text-[11px] text-sky-700 dark:text-sky-300 font-arabic truncate text-right mt-0.5 leading-tight" dir="rtl">
                        {item.arabicTitle}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}

            {filteredChapters.length === 0 && (
              <div className="py-4 text-center text-xs text-slate-400">
                No matching chapters found
              </div>
            )}
          </div>

          {/* Quick Actions Footer */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {flattenedChapters.filter(c => c.isComplete).length}/{flattenedChapters.length} Chapters done
            </span>
            <button
              type="button"
              onClick={onOpenTocModal}
              className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium hover:underline inline-flex items-center gap-1"
            >
              <span>Manage Titles</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
