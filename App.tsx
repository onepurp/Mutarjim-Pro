import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Book, Play, Pause, Download, AlertCircle, Save, FolderOpen, Image as ImageIcon, Settings, Home, FileText, ChevronRight, ChevronLeft, Edit3, RefreshCw, X, Check, Globe, LogOut, Type, Minus, Plus } from 'lucide-react';
import { AppState, ProjectData, Segment, SegmentStatus, SystemLogEntry, LogType, LiveLogItem } from './types';
import { dbService } from './services/db';
import { epubService } from './services/epubService';
import { geminiService } from './services/geminiService';
import { backupService } from './services/backupService';
import { Button, Card, ProgressBar, Badge, Spinner, SegmentMap, SystemLog, Modal, Input, Label, SplitView } from './components/ui';

const App = () => {
  // Application State
  const [view, setView] = useState<'landing' | 'studio'>('landing');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  
  // Studio UI State
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editArabicTitle, setEditArabicTitle] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);

  // Appearance State
  const [fontSize, setFontSize] = useState<number>(18);
  const [fontType, setFontType] = useState<'serif' | 'sans'>('serif');

  // Refs for processing loop
  const processingRef = useRef<boolean>(false);
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

  // --- DATA LOADING ---
  const loadProject = useCallback(async () => {
      try {
          const proj = await dbService.getProject();
          if (proj) {
              if (proj.customCoverBlob instanceof Blob) {
                  proj.coverUrl = URL.createObjectURL(proj.customCoverBlob);
              }
              setProject(proj);
              const segs = await dbService.getAllSegments();
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
          const blob = await epubService.reassembleEpub(
              project.sourceEpubBlob, 
              await dbService.getAllSegments(), 
              project.customCoverBlob, 
              { arabicTitle: project.arabicTitle, author: project.author, originalTitle: project.title }
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${project.arabicTitle || "Translated"} - ${project.author}.epub`;
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
          a.download = `mutarjim_backup_${Date.now()}.mtj`;
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
          setSegments([]);
          setView('landing');
          addLog("Project deleted.", 'WARNING');
      }
  };

  // --- TRANSLATION LOOP ---

  const processQueue = useCallback(async () => {
      if (processingRef.current) return;
      processingRef.current = true;
      addLog("Processor started.", 'INFO');

      while (processingRef.current) {
          const segment = await dbService.getPendingSegment();
          
          if (!segment) {
              const stats = await dbService.getStats();
              if (stats.translated === stats.total && stats.total > 0) {
                  setAppState(AppState.COMPLETED);
                  addLog("Project completed!", 'SUCCESS');
              } else {
                  setAppState(AppState.IDLE);
              }
              processingRef.current = false;
              break;
          }

          // UI Update: Focus on the working segment
          const idx = parseInt(segment.id.split('::').pop() || '0'); // Assuming ID scheme
          // Better way to find index in current array
          const segIndex = segments.findIndex(s => s.id === segment.id);
          if (segIndex !== -1) setActiveSegmentIndex(segIndex);

          try {
              // Mark as translating
              setSegments(prev => {
                  const copy = [...prev];
                  const i = copy.findIndex(s => s.id === segment.id);
                  if (i !== -1) copy[i] = { ...copy[i], status: SegmentStatus.TRANSLATING };
                  return copy;
              });

              // Translate
              const translatedHtml = await geminiService.translateHtml(segment.originalHtml);
              
              // Update DB
              segment.translatedHtml = translatedHtml;
              segment.status = SegmentStatus.TRANSLATED;
              segment.error = undefined;
              await dbService.updateSegment(segment);

              // Update State
              setSegments(prev => {
                  const copy = [...prev];
                  const i = copy.findIndex(s => s.id === segment.id);
                  if (i !== -1) copy[i] = segment;
                  return copy;
              });
              setProject(prev => prev ? ({ ...prev, translatedSegments: prev.translatedSegments + 1 }) : null);

              // Small delay for UX
              await new Promise(r => setTimeout(r, 100));

          } catch (e: any) {
              console.error(e);
              const isQuota = e.message?.includes('429') || e.status === 429;
              
              if (isQuota) {
                  setAppState(AppState.QUOTA_PAUSED);
                  addLog("API Quota hit. Pausing.", 'WARNING');
                  
                  // Fix: Ensure we revert the database status as well, not just local state
                  segment.status = SegmentStatus.PENDING;
                  await dbService.updateSegment(segment);
                  
                  // Revert status to PENDING so UI doesn't show it stuck in translating
                  setSegments(prev => {
                      const copy = [...prev];
                      const i = copy.findIndex(s => s.id === segment.id);
                      if (i !== -1) copy[i] = { ...copy[i], status: SegmentStatus.PENDING };
                      return copy;
                  });
                  
                  processingRef.current = false;
                  break;
              }

              segment.status = SegmentStatus.FAILED;
              segment.error = e.message;
              segment.retryCount = (segment.retryCount || 0) + 1;
              
              if (segment.retryCount >= 3) {
                  segment.status = SegmentStatus.SKIPPED;
                  addLog(`Segment ${segment.id} skipped (max retries).`, 'WARNING');
              }

              await dbService.updateSegment(segment);
               setSegments(prev => {
                  const copy = [...prev];
                  const i = copy.findIndex(s => s.id === segment.id);
                  if (i !== -1) copy[i] = segment;
                  return copy;
              });

              await new Promise(r => setTimeout(r, 1000));
          }

          if (appState === AppState.PAUSED) {
              processingRef.current = false;
              break;
          }
      }
  }, [appState, segments, addLog]);

  useEffect(() => {
      if (appState === AppState.TRANSLATING) {
          processQueue();
      } else {
          processingRef.current = false;
      }
  }, [appState, processQueue]);

  const togglePlayPause = () => {
      setAppState(curr => curr === AppState.TRANSLATING ? AppState.PAUSED : AppState.TRANSLATING);
  };

  const retrySkipped = async () => {
      await dbService.retrySkippedSegments();
      const updated = await dbService.getAllSegments();
      setSegments(updated);
      addLog("Retrying skipped segments...", 'INFO');
      setAppState(AppState.TRANSLATING);
  };

  // --- VIEWS ---

  if (view === 'landing') {
      return (
          <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
              <header className="h-20 border-b border-slate-200 bg-white flex items-center px-8 justify-between sticky top-0 z-10">
                  <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/30">
                          <Book className="text-white w-6 h-6" />
                      </div>
                      <div>
                          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Mutarjim Pro</h1>
                          <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">AI Translator Studio</p>
                      </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.open('https://github.com', '_blank')}>
                      <Globe className="w-4 h-4 mr-2" /> Documentation
                  </Button>
              </header>

              <main className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-100/40 via-transparent to-transparent pointer-events-none" />
                  
                  <div className="max-w-4xl w-full z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                      <div className="space-y-6">
                           <h2 className="text-4xl lg:text-5xl font-extrabold text-slate-900 leading-[1.15]">
                               Translate EPUBs to <span className="text-brand-600">Native Arabic</span> with AI.
                           </h2>
                           <p className="text-lg text-slate-600 leading-relaxed">
                               Professional-grade translation preserving formatting, structure, and literary tone using Google Gemini 2.5/3 models.
                           </p>
                           
                           <div className="flex flex-col gap-4">
                               <div className="relative group">
                                   <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 to-sky-400 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
                                   <label className="relative flex items-center justify-center gap-3 w-full bg-white hover:bg-brand-50 text-slate-900 font-semibold h-14 rounded-xl border border-slate-200 cursor-pointer transition-all shadow-sm">
                                       <Upload className="w-5 h-5 text-brand-600" />
                                       <span>Open EPUB File</span>
                                       <input type="file" className="hidden" accept=".epub" onChange={handleFileUpload} />
                                   </label>
                               </div>
                               
                               <div className="grid grid-cols-2 gap-4">
                                  <label className="flex items-center justify-center gap-2 h-12 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer transition-colors">
                                      <FolderOpen className="w-4 h-4" />
                                      <span>Restore Backup</span>
                                      <input key={fileInputKey} type="file" className="hidden" accept=".mtj" onChange={handleRestoreBackup} />
                                  </label>
                                  <Button variant="ghost" disabled className="justify-center border border-transparent">
                                      Recent Projects (Empty)
                                  </Button>
                               </div>
                           </div>
                      </div>

                      {/* Feature Graphic */}
                      <div className="relative">
                          <Card className="p-6 rotate-3 shadow-2xl bg-white/90 backdrop-blur border-slate-200/50">
                               <div className="space-y-4">
                                   <div className="h-4 bg-slate-100 rounded w-3/4 animate-pulse"></div>
                                   <div className="h-4 bg-slate-100 rounded w-full animate-pulse"></div>
                                   <div className="h-4 bg-slate-100 rounded w-5/6 animate-pulse"></div>
                                   <div className="flex gap-4 mt-6">
                                       <div className="flex-1 p-4 bg-slate-50 rounded-lg border border-slate-100">
                                           <p className="font-serif text-slate-400 text-sm">The sky was the color of television...</p>
                                       </div>
                                       <div className="flex-1 p-4 bg-brand-50/50 rounded-lg border border-brand-100">
                                           <p className="font-arabic text-slate-800 text-sm text-right" dir="rtl">كانت السماء بلون التلفزيون...</p>
                                       </div>
                                   </div>
                               </div>
                          </Card>
                      </div>
                  </div>
              </main>
              
              {loadingMsg && (
                  <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-50 flex items-center justify-center flex-col animate-in fade-in">
                      <Spinner className="w-10 h-10 text-brand-600 mb-4" />
                      <p className="text-lg font-medium text-slate-800">{loadingMsg}</p>
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
      <div className="h-screen flex bg-slate-100 overflow-hidden font-sans">
          {/* Sidebar */}
          <aside className="w-72 bg-white border-r border-slate-200 flex flex-col z-20 shadow-sm">
              <div className="h-16 flex items-center px-6 border-b border-slate-100 gap-3">
                   <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                       <Book className="text-white w-4 h-4" />
                   </div>
                   <span className="font-bold text-slate-800 tracking-tight">Mutarjim Pro</span>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-8">
                  {/* Cover & Title */}
                  <div className="flex flex-col items-center text-center">
                      <div className="w-32 h-48 bg-slate-200 rounded-md shadow-md mb-4 overflow-hidden relative group">
                          {project.coverUrl ? (
                              <img src={project.coverUrl} className="w-full h-full object-cover" />
                          ) : (
                              <div className="flex items-center justify-center h-full text-slate-400">
                                  <ImageIcon className="w-8 h-8" />
                              </div>
                          )}
                          <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                               <span className="text-white text-xs font-bold border border-white px-2 py-1 rounded">Change Cover</span>
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
                      <h2 className="font-bold text-slate-900 line-clamp-2 leading-tight mb-1">{project.title}</h2>
                      <p className="text-sm text-slate-500 mb-3">{project.author}</p>
                      {project.arabicTitle && (
                          <div className="bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-sm font-arabic">{project.arabicTitle}</div>
                      )}
                      <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => {
                          setEditArabicTitle(project.arabicTitle || '');
                          setIsEditModalOpen(true);
                      }}>
                          Edit Details
                      </Button>
                  </div>

                  {/* Stats */}
                  <div className="space-y-4">
                      <Label>Translation Progress</Label>
                      <ProgressBar current={project.translatedSegments} total={project.totalSegments} />
                      <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                              <div className="text-xl font-bold text-slate-900">{project.translatedSegments}</div>
                              <div className="text-[10px] uppercase text-slate-500 font-semibold mt-1">Done</div>
                          </div>
                          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                              <div className="text-xl font-bold text-slate-900">{project.totalSegments - project.translatedSegments}</div>
                              <div className="text-[10px] uppercase text-slate-500 font-semibold mt-1">Remaining</div>
                          </div>
                      </div>
                  </div>

                  {/* Controls */}
                  <div className="space-y-2">
                      <Label>Actions</Label>
                      {appState === AppState.TRANSLATING ? (
                          <Button onClick={togglePlayPause} className="w-full bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200">
                              <Pause className="w-4 h-4 mr-2" /> Pause
                          </Button>
                      ) : (
                          <Button onClick={togglePlayPause} disabled={appState === AppState.COMPLETED} className="w-full">
                              <Play className="w-4 h-4 mr-2" /> 
                              {appState === AppState.IDLE ? 'Start Translation' : 'Resume'}
                          </Button>
                      )}
                      
                      {skippedCount > 0 && appState !== AppState.TRANSLATING && (
                          <Button variant="outline" onClick={retrySkipped} className="w-full border-amber-200 text-amber-700 hover:bg-amber-50">
                              <RefreshCw className="w-4 h-4 mr-2" /> Retry {skippedCount} Skipped
                          </Button>
                      )}

                      <Button variant="secondary" onClick={handleBackup} className="w-full">
                          <Save className="w-4 h-4 mr-2" /> Backup Project
                      </Button>
                  </div>
                  
                  {/* Minimap */}
                  <div className="flex-1 min-h-[100px] border border-slate-200 rounded-lg bg-slate-50 p-2">
                       <SegmentMap segments={segments} onClickSegment={(s) => {
                           const idx = segments.findIndex(seg => seg.id === s.id);
                           if (idx !== -1) setActiveSegmentIndex(idx);
                       }} />
                  </div>
              </div>
              
              <div className="p-4 border-t border-slate-200">
                   <Button variant="ghost" size="sm" className="w-full justify-start text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => setView('landing')}>
                       <LogOut className="w-4 h-4 mr-2" /> Close Project
                   </Button>
                   <button onClick={deleteProject} className="w-full text-[10px] text-slate-400 hover:text-rose-500 mt-2">Delete Project Data</button>
              </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col min-w-0 h-full relative">
              {/* Header */}
              <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
                   <div className="flex items-center gap-4">
                       <div className="flex items-center gap-2">
                           <span className="text-sm font-semibold text-slate-500">Segment</span>
                           <div className="flex items-center bg-slate-100 rounded-lg p-1">
                               <button disabled={activeSegmentIndex <= 0} onClick={() => setActiveSegmentIndex(i => i - 1)} className="p-1 hover:bg-white rounded shadow-sm disabled:opacity-50"><ChevronLeft className="w-4 h-4"/></button>
                               <span className="w-16 text-center text-xs font-mono">{activeSegmentIndex + 1} / {segments.length}</span>
                               <button disabled={activeSegmentIndex >= segments.length - 1} onClick={() => setActiveSegmentIndex(i => i + 1)} className="p-1 hover:bg-white rounded shadow-sm disabled:opacity-50"><ChevronRight className="w-4 h-4"/></button>
                           </div>
                       </div>
                       {activeSegment && <Badge status={activeSegment.status} />}
                   </div>

                   <div className="flex items-center gap-3">
                       {/* Font Controls */}
                       <div className="flex items-center bg-slate-100 rounded-lg p-1 mr-2">
                           <button 
                                onClick={() => setFontType(t => t === 'serif' ? 'sans' : 'serif')} 
                                className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600 transition-colors"
                                title="Toggle Font Type"
                            >
                               <Type className="w-4 h-4" />
                           </button>
                           <div className="w-px h-4 bg-slate-200 mx-1"></div>
                           <button onClick={() => setFontSize(s => Math.max(12, s - 2))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600 transition-colors"><Minus className="w-3 h-3"/></button>
                           <span className="text-xs font-mono w-6 text-center text-slate-500 select-none">{fontSize}</span>
                           <button onClick={() => setFontSize(s => Math.min(32, s + 2))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600 transition-colors"><Plus className="w-3 h-3"/></button>
                       </div>

                       <Button variant="primary" onClick={handleExport} disabled={appState === AppState.TRANSLATING}>
                           <Download className="w-4 h-4 mr-2" /> Export EPUB
                       </Button>
                   </div>
              </header>

              {/* Translation Workspace & Log Container */}
              <div className="flex-1 flex flex-col min-h-0 bg-slate-100/50">
                  {/* Split View Area */}
                  <div className="flex-1 overflow-hidden p-6 pb-2">
                      <div className="max-w-7xl mx-auto h-full shadow-sm bg-white rounded-xl overflow-hidden border border-slate-200">
                          {activeSegment ? (
                              <SplitView 
                                  original={activeSegment.originalHtml} 
                                  translated={activeSegment.translatedHtml} 
                                  isTranslating={activeSegment.status === SegmentStatus.TRANSLATING}
                                  fontSize={fontSize}
                                  fontType={fontType}
                              />
                          ) : (
                              <div className="h-full flex items-center justify-center text-slate-400">Select a segment</div>
                          )}
                      </div>
                  </div>
                  
                  {/* System Console - Now part of flex flow */}
                  <SystemLog logs={systemLogs} isOpen={isConsoleOpen} toggle={() => setIsConsoleOpen(!isConsoleOpen)} />
              </div>

          </main>

          {/* Modals */}
          <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Project Metadata">
              <div className="space-y-4">
                  <div>
                      <Label>Original Title</Label>
                      <Input value={project.title} disabled className="bg-slate-50" />
                  </div>
                  <div>
                      <Label>Arabic Title (Required for Export)</Label>
                      <Input 
                          value={editArabicTitle} 
                          onChange={(e) => setEditArabicTitle(e.target.value)} 
                          placeholder="e.g. الكتاب المترجم"
                          dir="rtl"
                          className="font-arabic"
                      />
                      <p className="text-xs text-slate-500 mt-1">This will be the title of the exported EPUB file.</p>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                      <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                      <Button onClick={() => {
                          const updated = { ...project, arabicTitle: editArabicTitle };
                          setProject(updated);
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