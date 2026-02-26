import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Book, Play, Pause, Download, AlertCircle, Save, FolderOpen, Image as ImageIcon, Settings, Home, FileText, ChevronRight, ChevronLeft, Edit3, RefreshCw, X, Check, Globe, LogOut, Type, Minus, Plus, AlignLeft, AlignCenter, AlignRight, AlignJustify, Layout, Wand2, Moon, Sun } from 'lucide-react';
import { AppState, ProjectData, Segment, SegmentStatus, SystemLogEntry, LogType, LiveLogItem, AIDebugLogEntry, ExportSettings } from './types';
import { dbService } from './services/db';
import { epubService } from './services/epubService';
import { geminiService } from './services/geminiService';
import { backupService } from './services/backupService';
import { useTranslationProcessor } from './hooks/useTranslationProcessor';
import { Button, Card, ProgressBar, Badge, Spinner, SegmentMap, Console, Modal, Input, Label, SplitView } from './components/ui';

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mutarjim-theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('mutarjim-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('mutarjim-theme', 'light');
    }
  }, [isDark]);

  return [isDark, setIsDark] as const;
}

const App = () => {
  // Application State
  const [view, setView] = useState<'landing' | 'studio'>('landing');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const segmentsRef = useRef<Segment[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([]);
  const [aiLogs, setAiLogs] = useState<AIDebugLogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  
  // Studio UI State
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editArabicTitle, setEditArabicTitle] = useState('');
  const [isTranslatingTitle, setIsTranslatingTitle] = useState(false);
  const [editExportSettings, setEditExportSettings] = useState<ExportSettings>({
      textAlignment: 'right',
      forceAlignment: false
  });
  const [fileInputKey, setFileInputKey] = useState(0);

  // Appearance State
  const [fontSize, setFontSize] = useState<number>(18);
  const [fontType, setFontType] = useState<'serif' | 'sans'>('serif');
  const [isDark, setIsDark] = useDarkMode();

  // Export Settings State
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
      textAlignment: 'right',
      forceAlignment: false
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  // --- LOGGING ---
  const addLog = useCallback((message: string, type: LogType = 'INFO') => {
      setSystemLogs(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          message,
          type
      }]);
  }, []);

  const addAiLog = useCallback((message: string, type: LogType = 'INFO', data?: any) => {
      setAiLogs(prev => {
          const newLog = {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: Date.now(),
              message,
              type,
              data
          };
          // Keep last 200 logs to prevent memory issues
          if (prev.length > 200) return [...prev.slice(1), newLog];
          return [...prev, newLog];
      });
  }, []);

  // --- DATA LOADING ---
  const loadProject = useCallback(async () => {
      try {
          const proj = await dbService.getProject();
          if (proj) {
              if (proj.customCoverBlob instanceof Blob) {
                  proj.coverUrl = URL.createObjectURL(proj.customCoverBlob);
              }
              setProject(proj);
              
              // Load saved export settings if available
              if (proj.exportSettings) {
                  setExportSettings(proj.exportSettings);
              }

              const segs = await dbService.getAllSegments();
              segmentsRef.current = segs;
              setSegments(segs);
              
              // Find first pending or translated segment to show
              const lastTranslatedIdx = segs.findIndex(s => s.status === SegmentStatus.PENDING);
              setActiveSegmentIndex(lastTranslatedIdx !== -1 ? lastTranslatedIdx : segs.length - 1);

              if (proj.translatedSegments === proj.totalSegments && proj.totalSegments > 0) {
                  setAppState(AppState.COMPLETED);
              } else {
                  setAppState(AppState.IDLE);
              }
              setView('studio');
          } else {
              setView('landing');
          }
      } catch (e) {
          console.error(e);
          addLog("Failed to load project", 'ERROR');
      }
  }, [addLog]);

  useEffect(() => {
      loadProject();
  }, [loadProject]);

  // --- ACTION HANDLERS ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoadingMsg("Analyzing EPUB structure...");
      setAppState(AppState.ANALYZING);
      
      try {
          await dbService.clearDatabase();
          addLog(`Parsing ${file.name}...`);
          const result = await epubService.parseAndSegment(file);
          
          if (result.segments.length === 0) throw new Error("No text content found in EPUB.");

          await dbService.saveProject(result.project);
          await dbService.addSegments(result.segments);
          
          addLog(`Project created with ${result.segments.length} segments.`, 'SUCCESS');
          await loadProject();
      } catch (e) {
          console.error(e);
          addLog((e as Error).message, 'ERROR');
          setAppState(AppState.ERROR);
      } finally {
          setLoadingMsg(null);
      }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setLoadingMsg("Restoring from backup...");
      try {
          await backupService.restoreBackup(file);
          addLog("Backup restored successfully.", 'SUCCESS');
          await loadProject();
      } catch (e) {
          addLog((e as Error).message, 'ERROR');
      } finally {
          setLoadingMsg(null);
          setFileInputKey(k => k + 1); // Reset input
      }
  };

  const handleExport = async () => {
      if (!project) return;
      try {
          addLog("Bundling EPUB...", 'INFO');
          // Update project with current settings before export
          const updatedProject = { ...project, exportSettings };
          await dbService.saveProject(updatedProject);
          setProject(updatedProject);

          const blob = await epubService.reassembleEpub(
              updatedProject.sourceEpubBlob, 
              await dbService.getAllSegments(), 
              updatedProject.customCoverBlob, 
              { 
                  arabicTitle: updatedProject.arabicTitle, 
                  author: updatedProject.author, 
                  originalTitle: updatedProject.title,
                  schemaVersion: updatedProject.schemaVersion, // Pass schema version for reliable export
                  exportSettings: updatedProject.exportSettings
              }
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          // Format: <the title in arabic> (مترجم) [Arabic Translation] [<original title> - <author>].epub
          const arabicTitle = updatedProject.arabicTitle || "Translated Book";
          a.download = `${arabicTitle} (مترجم) [Arabic Translation] [${updatedProject.title} - ${updatedProject.author}].epub`;
          a.click();
          addLog("Export complete.", 'SUCCESS');
      } catch (e) {
          addLog("Export failed: " + (e as Error).message, 'ERROR');
      }
  };

  const handleBackup = async () => {
      try {
          const blob = await backupService.createBackup();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          
          if (project) {
              const titlePart = project.title
                 .split('.')[0]
                 .replace(/[^a-zA-Z0-9\u0600-\u06FF\s\-_]/g, '')
                 .trim()
                 .replace(/\s+/g, '_');
                 
              const progress = project.totalSegments > 0 
                  ? Math.round((project.translatedSegments / project.totalSegments) * 100) 
                  : 0;
              
              const now = new Date();
              const dateStr = now.toISOString().split('T')[0];
              const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
              
              a.download = `${titlePart || 'backup'}_${progress}%_${dateStr}_${timeStr}.mtj`;
          } else {
              a.download = `mutarjim_backup_${Date.now()}.mtj`;
          }

          a.click();
          addLog("Backup downloaded.", 'SUCCESS');
      } catch (e) {
          addLog("Backup failed: " + (e as Error).message, 'ERROR');
      }
  };

  const deleteProject = async () => {
      if(confirm("Are you sure? This will delete all translation progress.")) {
          await dbService.clearDatabase();
          setProject(null);
          segmentsRef.current = [];
          setSegments([]);
          setView('landing');
          addLog("Project deleted.", 'WARNING');
      }
  };

  const openProjectSettings = () => {
      if (!project) return;
      setEditArabicTitle(project.arabicTitle || '');
      setEditExportSettings(project.exportSettings || { textAlignment: 'right', forceAlignment: false });
      setIsEditModalOpen(true);
  };

  const handleMagicTranslate = async () => {
      if (!project || isTranslatingTitle) return;
      
      setIsTranslatingTitle(true);
      try {
          const translatedTitle = await geminiService.translateTitle(project.title);
          setEditArabicTitle(translatedTitle);
      } catch (e) {
          console.error("Failed to translate title", e);
      } finally {
          setIsTranslatingTitle(false);
      }
  };

  const dbUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSegmentChange = useCallback((newText: string) => {
      const segment = segmentsRef.current[activeSegmentIndex];
      if (!segment) return;
      
      const updatedSegment = { ...segment, translatedHtml: newText };
      
      // Update state immediately for responsive UI
      const newSegments = [...segmentsRef.current];
      newSegments[activeSegmentIndex] = updatedSegment;
      segmentsRef.current = newSegments;
      setSegments(newSegments);
      
      // Debounce DB update
      if (dbUpdateTimeoutRef.current) clearTimeout(dbUpdateTimeoutRef.current);
      dbUpdateTimeoutRef.current = setTimeout(() => {
          dbService.updateSegment(updatedSegment);
      }, 500);
  }, [activeSegmentIndex]);

  // --- TRANSLATION LOOP ---
  const { processingRef } = useTranslationProcessor(
      appState,
      setAppState,
      segmentsRef,
      setSegments,
      setProject,
      setActiveSegmentIndex,
      addLog,
      addAiLog
  );

  const togglePlayPause = useCallback(() => {
      setAppState(curr => curr === AppState.TRANSLATING ? AppState.PAUSED : AppState.TRANSLATING);
  }, []);

  const retrySkipped = async () => {
      await dbService.retrySkippedSegments();
      const updated = await dbService.getAllSegments();
      segmentsRef.current = updated;
      setSegments(updated);
      addLog("Retrying skipped segments...", 'INFO');
      setAppState(AppState.TRANSLATING);
  };

  // --- VIEWS ---

  if (view === 'landing') {
      return (
          <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-200">
              <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center px-8 justify-between sticky top-0 z-10 transition-colors duration-200">
                  <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center shadow-md shadow-sky-500/20">
                          <Book className="text-white w-5 h-5" />
                      </div>
                      <div>
                          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50 tracking-tight">Mutarjim Pro</h1>
                      </div>
                  </div>
                  <div className="flex items-center gap-4">
                      <button onClick={() => setIsDark(!isDark)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                      </button>
                      <Button variant="outline" size="sm" onClick={() => window.open('https://github.com', '_blank')}>
                          <Globe className="w-4 h-4 mr-2" /> Documentation
                      </Button>
                  </div>
              </header>

              <main className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100/40 dark:from-sky-900/20 via-transparent to-transparent pointer-events-none" />
                  
                  <div className="max-w-3xl w-full z-10 flex flex-col items-center text-center space-y-8">
                       <h2 className="text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-slate-50 leading-[1.15] tracking-tight">
                           Translate EPUBs to <span className="text-sky-500">Native Arabic</span> with AI.
                       </h2>
                       <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                           Professional-grade translation preserving formatting, structure, and literary tone using Google Gemini models.
                       </p>
                       
                       <div className="flex flex-col gap-4 w-full max-w-md">
                           <div className="relative group">
                               <div className="absolute -inset-1 bg-gradient-to-r from-sky-500 to-sky-400 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
                               <label className="relative flex items-center justify-center gap-3 w-full bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-50 font-semibold h-14 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-all shadow-sm">
                                   <Upload className="w-5 h-5 text-sky-500" />
                                   <span>Open EPUB File</span>
                                   <input type="file" className="hidden" accept=".epub" onChange={handleFileUpload} />
                               </label>
                           </div>
                           
                           <label className="flex items-center justify-center gap-2 h-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium cursor-pointer transition-colors">
                               <FolderOpen className="w-4 h-4" />
                               <span>Restore Backup (.mtj)</span>
                               <input key={fileInputKey} type="file" className="hidden" accept=".mtj" onChange={handleRestoreBackup} />
                           </label>
                       </div>
                  </div>
              </main>
              
              {loadingMsg && (
                  <div className="fixed inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center flex-col animate-in fade-in">
                      <Spinner className="w-10 h-10 text-sky-500 mb-4" />
                      <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{loadingMsg}</p>
                  </div>
              )}
          </div>
      )
  }

  // --- STUDIO VIEW ---
  
  // Guard for null project in studio
  if (!project) return null;

  const activeSegment = segments[activeSegmentIndex];
  const progressPercent = Math.round((project.translatedSegments / project.totalSegments) * 100) || 0;
  const skippedCount = segments.filter(s => s.status === SegmentStatus.SKIPPED).length;

  return (
      <div className="h-screen flex bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans transition-colors duration-200">
          {/* Sidebar */}
          <aside className="w-80 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col z-20 shadow-sm transition-colors duration-200">
              <div className="h-14 flex items-center px-6 border-b border-slate-100 dark:border-slate-700 gap-3 shrink-0">
                   <div className="w-7 h-7 bg-sky-500 rounded-md flex items-center justify-center">
                       <Book className="text-white w-3.5 h-3.5" />
                   </div>
                   <span className="font-bold text-slate-800 dark:text-slate-50 tracking-tight text-sm">Mutarjim Pro</span>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-8 custom-scrollbar">
                  {/* Cover & Title */}
                  <div className="flex flex-col items-center text-center">
                      <div className="w-28 h-40 bg-slate-200 dark:bg-slate-700 rounded-md shadow-sm mb-4 overflow-hidden relative group">
                          {project.coverUrl ? (
                              <img src={project.coverUrl} className="w-full h-full object-cover" />
                          ) : (
                              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
                                  <ImageIcon className="w-8 h-8" />
                              </div>
                          )}
                          <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                               <span className="text-white text-xs font-bold border border-white/50 px-2 py-1 rounded">Change Cover</span>
                               <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                   if (e.target.files?.[0]) {
                                       project.customCoverBlob = e.target.files[0];
                                       project.coverUrl = URL.createObjectURL(e.target.files[0]);
                                       dbService.saveProject(project);
                                       setProject({...project});
                                   }
                               }} />
                          </label>
                      </div>
                      <h2 className="font-bold text-slate-900 dark:text-slate-50 line-clamp-2 leading-tight mb-1 text-sm">{project.title}</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{project.author}</p>
                      {project.arabicTitle && (
                          <div className="bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 px-3 py-1 rounded-full text-xs font-arabic">{project.arabicTitle}</div>
                      )}
                      <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={openProjectSettings}>
                          Edit Details
                      </Button>
                  </div>

                  {/* Stats */}
                  <div className="space-y-4">
                      <Label>Translation Progress</Label>
                      <ProgressBar current={project.translatedSegments} total={project.totalSegments} />
                      <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50 text-center">
                              <div className="text-xl font-bold text-slate-900 dark:text-slate-50">{project.translatedSegments}</div>
                              <div className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold mt-1">Done</div>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50 text-center">
                              <div className="text-xl font-bold text-slate-900 dark:text-slate-50">{project.totalSegments - project.translatedSegments}</div>
                              <div className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold mt-1">Remaining</div>
                          </div>
                      </div>
                  </div>

                  {/* Controls */}
                  <div className="space-y-2">
                      <Label>Actions</Label>
                      {appState === AppState.TRANSLATING ? (
                          <Button onClick={togglePlayPause} className="w-full bg-amber-500 hover:bg-amber-600 text-white shadow-sm dark:bg-amber-600 dark:hover:bg-amber-500 dark:text-slate-900">
                              <Pause className="w-4 h-4 mr-2" /> Pause
                          </Button>
                      ) : (
                          <Button onClick={togglePlayPause} disabled={appState === AppState.COMPLETED} className="w-full">
                              <Play className="w-4 h-4 mr-2" /> 
                              {appState === AppState.IDLE ? 'Start Translation' : 'Resume'}
                          </Button>
                      )}
                      
                      {skippedCount > 0 && appState !== AppState.TRANSLATING && (
                          <Button variant="outline" onClick={retrySkipped} className="w-full border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800/50 dark:text-amber-400 dark:hover:bg-amber-900/20">
                              <RefreshCw className="w-4 h-4 mr-2" /> Retry {skippedCount} Skipped
                          </Button>
                      )}

                      <Button variant="secondary" onClick={handleBackup} className="w-full">
                          <Save className="w-4 h-4 mr-2" /> Backup Project
                      </Button>
                  </div>
                  
                  {/* Minimap */}
                  <div className="flex-1 min-h-[120px] border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-2">
                       <SegmentMap segments={segments} onClickSegment={(s) => {
                           const idx = segments.findIndex(seg => seg.id === s.id);
                           if (idx !== -1) setActiveSegmentIndex(idx);
                       }} />
                  </div>
              </div>
              
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
                   <Button variant="ghost" size="sm" className="w-full justify-start text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-900/20" onClick={() => setView('landing')}>
                       <LogOut className="w-4 h-4 mr-2" /> Close Project
                   </Button>
                   <button onClick={deleteProject} className="w-full text-[10px] text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400 mt-2 transition-colors">Delete Project Data</button>
              </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col min-w-0 h-full relative bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
              {/* Header */}
              <header className="h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 shrink-0 z-10 transition-colors duration-200">
                   <div className="flex items-center gap-4">
                       <div className="flex items-center gap-2">
                           <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Segment</span>
                           <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-md p-1 border border-slate-200 dark:border-slate-700">
                               <button disabled={activeSegmentIndex <= 0} onClick={() => setActiveSegmentIndex(i => i - 1)} className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300 disabled:opacity-50 transition-colors"><ChevronLeft className="w-4 h-4"/></button>
                               <span className="w-16 text-center text-xs font-mono text-slate-700 dark:text-slate-300">{activeSegmentIndex + 1} / {segments.length}</span>
                               <button disabled={activeSegmentIndex >= segments.length - 1} onClick={() => setActiveSegmentIndex(i => i + 1)} className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300 disabled:opacity-50 transition-colors"><ChevronRight className="w-4 h-4"/></button>
                           </div>
                       </div>
                       {activeSegment && <Badge status={activeSegment.status} />}
                   </div>

                   <div className="flex items-center gap-3">
                       {/* Font Controls */}
                       <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-md p-1 mr-2 border border-slate-200 dark:border-slate-700">
                           <button 
                                onClick={() => setFontType(t => t === 'serif' ? 'sans' : 'serif')} 
                                className="p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300 transition-colors"
                                title="Toggle Font Type"
                            >
                               <Type className="w-4 h-4" />
                           </button>
                           <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                           <button onClick={() => setFontSize(s => Math.max(12, s - 2))} className="p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300 transition-colors"><Minus className="w-3 h-3"/></button>
                           <span className="text-xs font-mono w-6 text-center text-slate-500 dark:text-slate-400 select-none">{fontSize}</span>
                           <button onClick={() => setFontSize(s => Math.min(32, s + 2))} className="p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300 transition-colors"><Plus className="w-3 h-3"/></button>
                       </div>

                       <button onClick={() => setIsDark(!isDark)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
                           {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                       </button>

                        {/* Export Controls */}
                       <div className="flex items-center gap-1 ml-2">
                            <Button variant="primary" size="sm" onClick={handleExport} disabled={appState === AppState.TRANSLATING}>
                                <Download className="w-4 h-4 mr-2" /> Export EPUB
                            </Button>
                       </div>
                   </div>
              </header>

              {/* Translation Workspace & Log Container */}
              <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-900">
                  {/* Split View Area */}
                  <div className="flex-1 overflow-hidden p-6 pb-2">
                      <div className="w-full h-full">
                          {activeSegment ? (
                              <SplitView 
                                  original={activeSegment.originalHtml} 
                                  translated={activeSegment.translatedHtml} 
                                  onTranslatedChange={handleSegmentChange}
                                  isTranslating={activeSegment.status === SegmentStatus.TRANSLATING}
                                  fontSize={fontSize}
                                  fontType={fontType}
                              />
                          ) : (
                              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500">Select a segment</div>
                          )}
                      </div>
                  </div>
                  
                  {/* Action Bar */}
                  {activeSegment && (
                      <div className="h-14 shrink-0 flex items-center justify-between px-6 mx-6 mb-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                              {/* Keyboard shortcuts removed */}
                          </div>
                          <div className="flex items-center gap-2">
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={() => setActiveSegmentIndex(i => Math.max(0, i - 1))}
                                disabled={activeSegmentIndex <= 0}
                              >
                                  Previous
                              </Button>
                              <Button 
                                variant="primary" 
                                size="sm" 
                                onClick={() => {
                                    const segment = segmentsRef.current[activeSegmentIndex];
                                    if (segment && segment.status !== SegmentStatus.TRANSLATED) {
                                        const updatedSegment = { ...segment, status: SegmentStatus.TRANSLATED };
                                        dbService.updateSegment(updatedSegment).then(() => {
                                            const newSegments = [...segmentsRef.current];
                                            newSegments[activeSegmentIndex] = updatedSegment;
                                            segmentsRef.current = newSegments;
                                            setSegments(newSegments);
                                        });
                                    }
                                    const nextIdx = segmentsRef.current.findIndex((s, i) => i > activeSegmentIndex && s.status === SegmentStatus.PENDING);
                                    if (nextIdx !== -1) setActiveSegmentIndex(nextIdx);
                                    else setActiveSegmentIndex(Math.min(segmentsRef.current.length - 1, activeSegmentIndex + 1));
                                }}
                              >
                                  <Check className="w-4 h-4 mr-1.5" /> Approve & Next
                              </Button>
                          </div>
                      </div>
                  )}
                  
                  {/* System Console */}
                  <Console 
                      systemLogs={systemLogs} 
                      aiLogs={aiLogs} 
                      isOpen={isConsoleOpen} 
                      toggle={() => setIsConsoleOpen(!isConsoleOpen)} 
                  />
              </div>

          </main>

          {/* Project Settings Modal */}
          <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Project Settings">
              <div className="space-y-4">
                  {/* Metadata Section */}
                  <div>
                      <Label>Book Title (Arabic)</Label>
                      <div className="flex gap-2">
                        <Input 
                            value={editArabicTitle} 
                            onChange={(e) => setEditArabicTitle(e.target.value)} 
                            placeholder="e.g. الكتاب المترجم"
                            dir="rtl"
                            className="font-arabic"
                        />
                        <Button 
                            variant="secondary" 
                            size="icon" 
                            onClick={handleMagicTranslate}
                            disabled={isTranslatingTitle}
                            title="Auto-translate title"
                            className="shrink-0"
                        >
                             {isTranslatingTitle ? <Spinner className="w-4 h-4" /> : <Wand2 className="w-4 h-4 text-sky-500" />}
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">This title will be used inside the EPUB and for the filename.</p>
                  </div>

                  {/* HTML Alignment Options */}
                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Text Alignment</h4>
                      
                      <div className="space-y-2">
                        <Label>Global Text Direction</Label>
                        <div className="flex gap-2">
                            <Button 
                                variant={editExportSettings.textAlignment === 'left' ? 'primary' : 'outline'} 
                                onClick={() => setEditExportSettings(s => ({...s, textAlignment: 'left'}))}
                                className="flex-1"
                                title="Align Left"
                                type="button"
                            >
                                <AlignLeft className="w-4 h-4 mr-2" /> Left
                            </Button>
                            <Button 
                                variant={editExportSettings.textAlignment === 'center' ? 'primary' : 'outline'} 
                                onClick={() => setEditExportSettings(s => ({...s, textAlignment: 'center'}))}
                                className="flex-1"
                                title="Align Center"
                                type="button"
                            >
                                <AlignCenter className="w-4 h-4 mr-2" /> Center
                            </Button>
                            <Button 
                                variant={editExportSettings.textAlignment === 'right' ? 'primary' : 'outline'} 
                                onClick={() => setEditExportSettings(s => ({...s, textAlignment: 'right'}))}
                                className="flex-1"
                                title="Align Right (Standard Arabic)"
                                type="button"
                            >
                                <AlignRight className="w-4 h-4 mr-2" /> Right
                            </Button>
                             <Button 
                                variant={editExportSettings.textAlignment === 'justify' ? 'primary' : 'outline'} 
                                onClick={() => setEditExportSettings(s => ({...s, textAlignment: 'justify'}))}
                                className="flex-1"
                                title="Justify"
                                type="button"
                            >
                                <AlignJustify className="w-4 h-4 mr-2" /> Justify
                            </Button>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-100 dark:border-amber-800/50">
                          <input 
                              type="checkbox" 
                              id="forceAlignment" 
                              checked={editExportSettings.forceAlignment} 
                              onChange={(e) => setEditExportSettings(s => ({...s, forceAlignment: e.target.checked}))}
                              className="w-4 h-4 mt-0.5 text-sky-500 rounded border-amber-300 dark:border-amber-700 focus:ring-sky-500 dark:bg-slate-800"
                          />
                          <div className="flex-1">
                            <label htmlFor="forceAlignment" className="text-sm font-medium text-amber-900 dark:text-amber-400 block mb-0.5">Force Alignment Override</label>
                            <p className="text-xs text-amber-700 dark:text-amber-500/80 leading-relaxed">
                                If checked, this applies <code>!important</code> to CSS rules, overriding existing styles (like centered poems or quotes). 
                                Uncheck this to preserve the book's original specific formatting while setting a default base direction.
                            </p>
                          </div>
                      </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                      <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                      <Button onClick={() => {
                          const updated = { 
                              ...project, 
                              arabicTitle: editArabicTitle,
                              exportSettings: editExportSettings
                          };
                          setProject(updated);
                          setExportSettings(editExportSettings);
                          dbService.saveProject(updated);
                          setIsEditModalOpen(false);
                      }}>Save Changes</Button>
                  </div>
              </div>
          </Modal>
      </div>
  );
};

export default App;
