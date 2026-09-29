import React, { useState, useEffect } from 'react';
import { ArchitectAnalysisResult, StructuralIssue, FontRecommendation } from '../types';
import { 
  AlertTriangle, CheckCircle, Info, BookOpen, Code, Globe, 
  AlertOctagon, ListTree, Type as TypeIcon, Sparkles, AlignLeft, 
  MoveVertical, Maximize, Edit3, RotateCcw, ShieldCheck 
} from 'lucide-react';
import { FontPickerModal } from './FontPickerModal';
import { ensureFontLoadedInDOM } from '../services/fontRegistry';

interface AnalysisReportProps {
  result: ArchitectAnalysisResult;
  onRepair: () => void;
  onCancel: () => void;
  isRepairing?: boolean;
  onUpdateFontRecommendations?: (updatedFonts: FontRecommendation[]) => void;
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

export const AnalysisReport: React.FC<AnalysisReportProps> = ({ 
  result, 
  onRepair, 
  onCancel, 
  isRepairing = false,
  onUpdateFontRecommendations
}) => {
  const [editingRole, setEditingRole] = useState<FontRecommendation | null>(null);

  // Pre-load current recommended fonts into browser DOM for live preview
  useEffect(() => {
    result.fontRecommendations?.forEach(rec => {
      ensureFontLoadedInDOM(rec.fontFamily);
    });
  }, [result.fontRecommendations]);

  const handleApplyFont = (updatedRec: FontRecommendation) => {
    const updatedList = result.fontRecommendations.map(rec => 
      rec.role === updatedRec.role ? updatedRec : rec
    );
    if (onUpdateFontRecommendations) {
      onUpdateFontRecommendations(updatedList);
    }
  };

  const handleResetFont = (role: string) => {
    const updatedList = result.fontRecommendations.map(rec => {
      if (rec.role === role && rec.originalFontFamily) {
        return {
          ...rec,
          fontFamily: rec.originalFontFamily,
          kebabName: rec.originalKebabName || rec.originalFontFamily.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          isCustomOverride: false,
          justification: `Restored original AI recommendation: ${rec.originalFontFamily}`
        };
      }
      return rec;
    });
    if (onUpdateFontRecommendations) {
      onUpdateFontRecommendations(updatedList);
    }
  };

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
          {/* Left: Book Personality & Interactive Fonts Map */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-6 rounded-xl border border-indigo-100 dark:border-indigo-800/50 flex flex-col">
             <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                   <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                   <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Book Personality & Fonts Map</h3>
                </div>
                <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100/60 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full border border-indigo-200/50 dark:border-indigo-800/50">
                   Role-Mapped
                </span>
             </div>
             
             <p className="text-slate-700 dark:text-slate-300 mb-4 font-medium italic text-sm">"{result.bookPersonality}"</p>
             
             <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Change any font below without altering the layout, spacing rhythm, or semantic font map:
             </p>
             
             <div className="space-y-2.5 flex-1">
                {result.fontRecommendations.map((font) => {
                    const isCustom = !!font.isCustomOverride;
                    return (
                        <div 
                           key={font.role} 
                           className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-xl border border-white/60 dark:border-slate-700/60 shadow-sm flex items-center justify-between gap-3 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
                        >
                           <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-slate-700 p-1.5 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                                 <TypeIcon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                 <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
                                       {font.role}
                                    </span>
                                    {isCustom && (
                                       <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 px-1.5 py-0.2 rounded font-mono">
                                          Customized
                                       </span>
                                    )}
                                 </div>
                                 <p 
                                    className="text-base text-slate-900 dark:text-slate-100 leading-tight truncate font-medium"
                                    style={{ fontFamily: `'${font.fontFamily}', sans-serif, serif` }}
                                    title={font.fontFamily}
                                 >
                                    {font.fontFamily}
                                 </p>
                                 <span className="text-[10px] text-slate-400 dark:text-slate-500 capitalize">
                                    {font.category} &bull; {font.subset}
                                 </span>
                              </div>
                           </div>

                           <div className="flex items-center gap-1 shrink-0">
                              {isCustom && (
                                 <button
                                    onClick={() => handleResetFont(font.role)}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                    title={`Reset to original (${font.originalFontFamily})`}
                                 >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                 </button>
                              )}
                              <button
                                 onClick={() => setEditingRole(font)}
                                 className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-800/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm"
                                 title={`Change ${font.role} font`}
                              >
                                 <Edit3 className="w-3 h-3" />
                                 Change
                              </button>
                           </div>
                        </div>
                    );
                })}
             </div>

             <div className="mt-4 pt-3 border-t border-indigo-100 dark:border-indigo-800/40 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Font changes preserve the structural CSS map and auto-fetch from Google Fonts CDN.</span>
             </div>
          </div>

          {/* Right: Visual Enhancements & Typography Profile */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
             <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
                <AlignLeft className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                <h3 className="text-lg font-bold">Visual Enhancements</h3>
             </div>
             <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Based on the analysis, we generated a <strong className="text-slate-700 dark:text-slate-200">{result.typographyProfile.themeName}</strong> profile. Layout rhythm and container proportions remain isolated and intact when substituting fonts.
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
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-2">CSS Optimization & Compliance</span>
                <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> Standardize to EM/REM units</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> Fix image overflow (max-width: 100%)</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> Preserve role-based CSS typography hierarchy</li>
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

      {/* Font Customization Modal */}
      {editingRole && (
        <FontPickerModal
          isOpen={!!editingRole}
          onClose={() => setEditingRole(null)}
          currentRecommendation={editingRole}
          isRTL={result.isRTL}
          detectedLanguage={result.detectedLanguage}
          onApplyFont={handleApplyFont}
          onResetToOriginal={() => handleResetFont(editingRole.role)}
        />
      )}
    </div>
  );
};
