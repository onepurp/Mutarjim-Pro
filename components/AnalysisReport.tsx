import React from 'react';
import { ArchitectAnalysisResult, StructuralIssue } from '../types';
import { AlertTriangle, CheckCircle, Info, BookOpen, Code, Globe, AlertOctagon, ListTree, Type as TypeIcon, Sparkles, AlignLeft, MoveVertical, Maximize } from 'lucide-react';

interface AnalysisReportProps {
  result: ArchitectAnalysisResult;
  onRepair: () => void;
  onCancel: () => void;
  isRepairing?: boolean;
}

const IssueCard: React.FC<{ issue: StructuralIssue }> = ({ issue }) => {
  const colors = {
    CRITICAL: "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400",
    WARNING: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400",
    INFO: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
  };

  const icons = {
    CRITICAL: <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400" />,
    WARNING: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
    INFO: <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
  };

  return (
    <div className={`p-4 rounded-lg border ${colors[issue.type]} mb-3`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icons[issue.type]}</div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-semibold text-sm uppercase tracking-wide opacity-90">{issue.category}</h4>
            {issue.autoFixable && (
                <span className="text-xs bg-white/50 dark:bg-slate-800/50 px-2 py-0.5 rounded-full font-medium border border-current">Auto-Fixable</span>
            )}
          </div>
          <p className="font-medium mb-1">{issue.description}</p>
          <p className="text-sm opacity-80">{issue.recommendation}</p>
        </div>
      </div>
    </div>
  );
};

export const AnalysisReport: React.FC<AnalysisReportProps> = ({ result, onRepair, onCancel, isRepairing = false }) => {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <BookOpen className="w-4 h-4" /> Manifest
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{result.manifestCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <Code className="w-4 h-4" /> CSS Files
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{result.cssFileCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <Globe className="w-4 h-4" /> Language
            </div>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase truncate">{result.detectedLanguage} {result.isRTL && '(RTL)'}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <ListTree className="w-4 h-4" /> TOC Status
            </div>
            <p className={`text-xl font-bold truncate ${result.tocStatus.exists ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {result.tocStatus.exists ? result.tocStatus.type : 'MISSING'}
            </p>
            {result.tocStatus.brokenLinks > 0 && (
                <p className="text-xs text-red-500 font-medium">{result.tocStatus.brokenLinks} broken links</p>
            )}
        </div>
      </div>

      {/* Personality & Typography Section */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-6 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
             <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Book Personality</h3>
             </div>
             <p className="text-slate-700 dark:text-slate-300 mb-4 font-medium italic">"{result.bookPersonality}"</p>
             
             <div className="space-y-3">
                {result.fontRecommendations.map((font, idx) => (
                    <div key={idx} className="bg-white/60 dark:bg-slate-800/60 p-2 rounded border border-white/50 dark:border-slate-700/50 flex items-center gap-3">
                       <div className="bg-slate-100 dark:bg-slate-700 p-1.5 rounded text-slate-600 dark:text-slate-300">
                          <TypeIcon className="w-3 h-3" />
                       </div>
                       <div className="min-w-0">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{font.role}</p>
                          <p className="font-serif text-slate-900 dark:text-slate-100 leading-tight truncate">{font.fontFamily}</p>
                       </div>
                    </div>
                ))}
             </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
             <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
                <AlignLeft className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                <h3 className="text-lg font-bold">Visual Enhancements</h3>
             </div>
             <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Based on the analysis, we have generated a <strong className="text-slate-700 dark:text-slate-200">{result.typographyProfile.themeName}</strong> profile to optimize reading comfort.
             </p>
             
             <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        <MoveVertical className="w-3 h-3" /> Line Height
                    </div>
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{result.typographyProfile.lineHeight}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        <AlignLeft className="w-3 h-3" /> Paragraph Spacing
                    </div>
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{result.typographyProfile.paragraphSpacing}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        <MoveVertical className="w-3 h-3" /> Heading Margin
                    </div>
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{result.typographyProfile.headingTopMargin}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        <Maximize className="w-3 h-3" /> Reading Width
                    </div>
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{result.typographyProfile.maxWidth}</p>
                </div>
             </div>
             
             <div className="mt-auto bg-indigo-50/50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-100 dark:border-indigo-800/50">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-2">CSS Optimization</span>
                <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> Standardize to EM/REM units</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> Fix image overflow (max-width: 100%)</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> Enforce semantic HTML hierarchy</li>
                </ul>
             </div>
          </div>
      </div>

      {/* Issues Section */}
      <div className="mb-8">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            Diagnosis Report
            <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs px-2 py-1 rounded-full">{result.issues.length} Issues</span>
        </h3>
        <div className="space-y-2">
            {result.issues.map(issue => <IssueCard key={issue.id} issue={issue} />)}
            {result.issues.length === 0 && (
                <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700">
                    <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                    <p className="text-emerald-800 dark:text-emerald-400 font-medium">No structural issues found! The book appears healthy.</p>
                </div>
            )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 justify-end sticky -bottom-6 z-10 bg-white dark:bg-slate-800 pt-4 pb-6 px-6 -mx-6 border-t border-slate-100 dark:border-slate-700 mt-8">
        <button 
            onClick={onCancel}
            disabled={isRepairing}
            className="px-6 py-3 rounded-lg text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium shadow-sm transition-colors disabled:opacity-50"
        >
            Cancel
        </button>
        <button 
            onClick={onRepair}
            disabled={isRepairing}
            className="px-6 py-3 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 font-medium shadow-lg hover:shadow-indigo-200 dark:hover:shadow-indigo-900 transition-all flex items-center gap-2 disabled:opacity-50"
        >
            {isRepairing ? (
                <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Repairing EPUB...
                </>
            ) : (
                <>
                    <CheckCircle className="w-5 h-5" />
                    Apply Intelligent Repair
                </>
            )}
        </button>
      </div>
    </div>
  );
};
