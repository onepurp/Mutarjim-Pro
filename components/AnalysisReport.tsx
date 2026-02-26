import React from 'react';
import { ArchitectAnalysisResult, StructuralIssue } from '../types';
import { AlertTriangle, CheckCircle, Info, BookOpen, Code, Globe, AlertOctagon, ListTree, Type as TypeIcon, Sparkles, AlignLeft, MoveVertical, Maximize } from 'lucide-react';

interface AnalysisReportProps {
  result: ArchitectAnalysisResult;
  onRepair: () => void;
  onCancel: () => void;
}

export const AnalysisReport: React.FC<AnalysisReportProps> = ({ result, onRepair, onCancel }) => {
  return (
    <div className="space-y-6">
      <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-sky-500" />
          EPUB Analysis Report
        </h3>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-100 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Detected Language</div>
            <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-400" />
              {result.detectedLanguage} ({result.isRTL ? 'RTL' : 'LTR'})
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-100 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Book Personality</div>
            <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              {result.bookPersonality}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">Detected Issues ({result.issues.length})</h4>
          {result.issues.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 p-3 rounded-md">
              <CheckCircle className="w-5 h-5" />
              <span>No structural issues found. The EPUB is clean!</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
              {result.issues.map((issue, idx) => (
                <div key={idx} className={`p-3 rounded-md border flex gap-3 ${
                  issue.type === 'CRITICAL' ? 'bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20' :
                  issue.type === 'WARNING' ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20' :
                  'bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/20'
                }`}>
                  <div className="mt-0.5 shrink-0">
                    {issue.type === 'CRITICAL' ? <AlertOctagon className="w-4 h-4 text-rose-500" /> :
                     issue.type === 'WARNING' ? <AlertTriangle className="w-4 h-4 text-amber-500" /> :
                     <Info className="w-4 h-4 text-sky-500" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{issue.description}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{issue.recommendation}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <button 
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button 
          onClick={onRepair}
          className="px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-md transition-colors flex items-center gap-2 shadow-sm"
        >
          <Sparkles className="w-4 h-4" />
          Auto-Repair EPUB
        </button>
      </div>
    </div>
  );
};
