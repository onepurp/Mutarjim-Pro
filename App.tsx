import React, { useState, useEffect, useCallback, useRef, Component, type ErrorInfo, type ReactNode } from 'react';
import { Upload, Book, Play, Pause, Download, AlertCircle, Save, FolderOpen, Image as ImageIcon, Settings, Home, Terminal as TerminalIcon, FileText, ChevronRight, Edit3 } from 'lucide-react';
import { AppState, ProjectData, Segment, SegmentStatus, SystemLogEntry, LogType, LiveLogItem } from './types';
import { dbService } from './services/db';
import { epubService } from './services/epubService';
import { geminiService } from './services/geminiService';
import { backupService } from './services/backupService';
import { Button, Card, ProgressBar, Badge, Spinner, SegmentMap, SystemLog, SegmentInspector, Modal, Input, Label } from './components/ui';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
            <div className="bg-white p-8 rounded-xl shadow-xl border border-rose-100 max-w-lg w-full">
                <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-rose-600" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">Critical Application Error</h1>
                <p className="text-slate-500 mb-6">The application encountered an unexpected state and needs to restart.</p>
                <pre className="text-xs text-left text-rose-700 bg-rose-50 p-4 rounded border border-rose-200 mb-6 overflow-auto max-h-32">
                    {this.state.error?.message}
                </pre>
                <Button onClick={() => window.location.reload()} variant="primary" className="w-full">
                    Reload Application
                </Button>
            </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const LoadingScreen = ({ message }: { message?: string }) => (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 space-y-6 animate-in fade-in duration-500 z-50 fixed inset-0">
        <div className="relative">
            <div className="absolute inset-0 bg-brand-200 rounded-full animate-ping opacity-50"></div>
            <div className="relative bg-white p-6 rounded-full shadow-lg border border-brand-100">
                 <Spinner className="w-8 h-8 text-brand-600" />
            </div>
        </div>
        <div className="text-center">
            <h3 className="text-lg font-semibold text-slate-800">Processing Project</h3>
            <p className="text-slate-500 text-sm mt-1">{message || "Please wait while we set things up..."}</p>
        </div>
    </div>
);

const AppContent: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  
  // UI State
  const [liveLog, setLiveLog] = useState<LiveLogItem[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customCover, setCustomCover] = useState<File | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editArabicTitle, setEditArabicTitle] = useState('');
  
  const processingRef = useRef<boolean>(false);

  // Helper to append system logs
  const addSystemLog = useCallback((message: string, type: LogType = 'INFO') => {
      setSystemLogs(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          timestamp: Date.now(),
          message,
          type
      }]);
  }, []);

  const loadProject = useCallback(async () => {
    try {
      const existing = await dbService.getProject();
      if (existing) {
        if (existing.customCoverBlob && existing.customCoverBlob instanceof Blob) {
           try {
              existing.coverUrl = URL.createObjectURL(existing.customCoverBlob);
           } catch (e) {
              console.warn("Failed to create object URL for cover", e);
           }
        }
        
        setProject(existing);
        const segs = await dbService.getAllSegments();
        setSegments(segs || []); 
        
        if (existing.totalSegments > 0 && existing.translatedSegments === existing.totalSegments) {
          setAppState(AppState.COMPLETED);
          addSystemLog("Project loaded. Status: Completed.", 'SUCCESS');
        } else {
            setAppState(AppState.IDLE);
            addSystemLog(`Project loaded. ${existing.translatedSegments}/${existing.totalSegments} segments ready.`, 'INFO');
        }
      } else {
          setProject(null);
          setSegments([]);
          setAppState(AppState.IDLE);
      }
    } catch (e) {
      console.error("Failed to load project", e);
      setErrorMsg("Failed to load project data.");
      addSystemLog("Failed to load project data from database.", 'ERROR');
    }
  }, [addSystemLog]);

  // Initial Load
  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAppState(AppState.ANALYZING);
    setErrorMsg(null);
    setLiveLog([]); 
    setSystemLogs([]);
    addSystemLog(`Started parsing EPUB: ${file.name}`, 'INFO');
    e.target.value = ''; 

    try {
      await dbService.clearDatabase();
      const result = await epubService.parseAndSegment(file);
      
      if (result.segments.length === 0) {
          throw new Error("No translatable segments found.");
      }

      if (customCover) {
          result.project.customCoverBlob = customCover;
          result.project.coverUrl = URL.createObjectURL(customCover);
      }

      await dbService.saveProject(result.project);
      await dbService.addSegments(result.segments);
      
      addSystemLog(`EPUB Parsed successfully. ${result.segments.length} segments identified.`, 'SUCCESS');
      await loadProject(); 
    } catch (err) {
      console.error(err);
      const msg = (err as Error).message;
      setErrorMsg(msg);
      addSystemLog(`Error parsing EPUB: ${msg}`, 'ERROR');
      setAppState(AppState.ERROR);
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setCustomCover(e.target.files[0]);
          addSystemLog("Custom cover selected.", 'INFO');
      }
      e.target.value = ''; 
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setProject(null);
      setSegments([]);
      setLiveLog([]); 
      setSystemLogs([]);
      setAppState(AppState.ANALYZING);
      setErrorMsg(null);
      addSystemLog(`Starting backup restore from: ${file.name}`, 'INFO');
      
      const backupFile = file;
      e.target.value = ''; 

      try {
          await backupService.restoreBackup(backupFile);
          addSystemLog("Backup restored successfully.", 'SUCCESS');
          await loadProject(); 
      } catch (err) {
          console.error(err);
          const msg = `Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
          setErrorMsg(msg);
          addSystemLog(msg, 'ERROR');
          setAppState(AppState.ERROR);
      }
  };

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    addSystemLog("Translation queue processing started.", 'INFO');

    while (processingRef.current) {
        const segment = await dbService.getPendingSegment();
        
        if (!segment) {
            const stats = await dbService.getStats();
            if (stats.translated === stats.total && stats.total > 0) {
                setAppState(AppState.COMPLETED);
                addSystemLog("All segments translated successfully!", 'SUCCESS');
            } else {
                 setAppState(AppState.IDLE);
                 addSystemLog("No pending segments found. Queue idle.", 'INFO');
            }
            processingRef.current = false;
            break;
        }

        if (segment.retryCount >= 3 && segment.status === SegmentStatus.FAILED) {
             segment.status = SegmentStatus.SKIPPED;
             await dbService.updateSegment(segment);
             setSegments(prev => prev.map(s => s.id === segment.id ? segment : s));
             
             const logItem: LiveLogItem = { 
                id: segment.id, 
                orig: segment.originalHtml, 
                trans: null, 
                status: SegmentStatus.SKIPPED,
                timestamp: Date.now()
             };
             setLiveLog(prev => [...prev.slice(-30), logItem]);
             addSystemLog(`Segment ${segment.id} skipped after max retries.`, 'WARNING');
             continue; 
        }

        try {
            setLiveLog(prev => {
                const newLog = [...prev];
                if (newLog.length > 0 && newLog[newLog.length - 1].id === segment.id) {
                     return newLog.map((item, i) => i === newLog.length - 1 ? 
                        { ...item, status: SegmentStatus.TRANSLATING, trans: null } : item
                     );
                }
                return [...newLog.slice(-30), { 
                    id: segment.id, 
                    orig: segment.originalHtml, 
                    trans: null, 
                    status: SegmentStatus.TRANSLATING,
                    timestamp: Date.now()
                }];
            });

            const translatedHtml = await geminiService.translateHtml(segment.originalHtml);
            
            segment.translatedHtml = translatedHtml;
            segment.status = SegmentStatus.TRANSLATED;
            segment.error = undefined;
            
            await dbService.updateSegment(segment);
            
            setSegments(prev => prev.map(s => s.id === segment.id ? segment : s));
            setProject(prev => prev ? ({ ...prev, translatedSegments: prev.translatedSegments + 1 }) : null);
            
            setLiveLog(prev => prev.map(log => 
                log.id === segment.id 
                ? { ...log, trans: translatedHtml, status: SegmentStatus.TRANSLATED } 
                : log
            ));
            
            await new Promise(r => setTimeout(r, 250));

        } catch (err: any) {
            console.error("Translation Error", err);
            
            if (err.message?.includes('429') || err.status === 429) {
                setAppState(AppState.QUOTA_PAUSED);
                addSystemLog("API Quota exceeded. Pausing queue.", 'WARNING');
                processingRef.current = false;
                break;
            }

            segment.status = SegmentStatus.FAILED;
            segment.error = err.message;
            segment.retryCount += 1;
            await dbService.updateSegment(segment);
            setSegments(prev => prev.map(s => s.id === segment.id ? segment : s));
            
            addSystemLog(`Segment ${segment.id} failed: ${err.message}`, 'ERROR');
            
             setLiveLog(prev => prev.map(log => 
                log.id === segment.id 
                ? { ...log, status: SegmentStatus.FAILED, error: err.message } 
                : log
            ));

            await new Promise(r => setTimeout(r, 2000));
        }

        if (appState === AppState.PAUSED) {
            processingRef.current = false;
            addSystemLog("Queue paused by user.", 'INFO');
            break;
        }
    }
  }, [appState, addSystemLog]);

  useEffect(() => {
    if (appState === AppState.TRANSLATING) {
        processQueue();
    } else {
        processingRef.current = false;
    }
  }, [appState, processQueue]);

  const toggleTranslation = () => {
    if (appState === AppState.TRANSLATING) {
        setAppState(AppState.PAUSED);
    } else {
        setAppState(AppState.TRANSLATING);
    }
  };

  const handleExport = async () => {
      if (!project) return;
      try {
          addSystemLog("Generating EPUB export...", 'INFO');
          const allSegments = await dbService.getAllSegments();
          const blob = await epubService.reassembleEpub(
              project.sourceEpubBlob, 
              allSegments, 
              project.customCoverBlob, 
              {
                  arabicTitle: project.arabicTitle,
                  author: project.author,
                  originalTitle: project.title
              }
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          
          // Filename format: <arabic_title> - <author_name> (مترجم) [original title]
          const arTitle = project.arabicTitle || "Translated";
          a.download = `${arTitle} - ${project.author} (مترجم) [${project.title}].epub`;
          
          a.click();
          addSystemLog("EPUB Exported successfully.", 'SUCCESS');
      } catch (e) {
          console.error(e);
          const msg = "Export failed: " + (e as Error).message;
          setErrorMsg(msg);
          addSystemLog(msg, 'ERROR');
      }
  };

  const handleBackup = async () => {
      try {
          setErrorMsg(null); 
          addSystemLog("Creating backup...", 'INFO');
          const blob = await backupService.createBackup();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `backup_${Date.now()}.mtj`;
          a.click();
          addSystemLog("Backup file created and downloaded.", 'SUCCESS');
      } catch (e) {
          console.error(e);
          const msg = `Backup failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
          setErrorMsg(msg);
          addSystemLog(msg, 'ERROR');
      }
  };

  const saveProjectDetails = async () => {
      if (project) {
          const updated = { ...project, arabicTitle: editArabicTitle };
          setProject(updated);
          await dbService.saveProject(updated);
          addSystemLog("Project details updated.", 'SUCCESS');
          setIsEditModalOpen(false);
      }
  };

  // State Routing
  if (appState === AppState.ANALYZING) {
      return <LoadingScreen message="Analyzing EPUB structure..." />;
  }

  // --- Landing Page ---
  if (!project) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 py-4">
            <div className="container mx-auto px-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Book className="w-8 h-8 text-brand-600" />
                    <span className="text-xl font-bold text-slate-900 tracking-tight">Mutarjim Pro</span>
                </div>
                <div className="text-sm text-slate-500 font-medium">Enterprise Edition</div>
            </div>
        </header>

        <main className="flex-1 container mx-auto px-6 py-12 flex flex-col items-center">
             <div className="text-center max-w-2xl mb-12">
                 <h1 className="text-4xl font-extrabold text-slate-900 mb-4 leading-tight">Professional AI Translation for EPUBs</h1>
                 <p className="text-lg text-slate-600">Offline-first, high-fidelity format preservation using Google Gemini models.</p>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                 <Card className="p-8 border-2 border-dashed border-slate-300 hover:border-brand-500 transition-all cursor-pointer group bg-slate-50 hover:bg-white">
                      <label className="flex flex-col items-center justify-center h-full cursor-pointer">
                          <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                             <Upload className="w-8 h-8 text-brand-600" />
                          </div>
                          <h3 className="text-xl font-semibold text-slate-900 mb-2">Upload EPUB File</h3>
                          <p className="text-slate-500 text-center text-sm">Select a book to begin translation</p>
                          <input type="file" className="hidden" accept=".epub" onChange={handleFileUpload} />
                      </label>
                 </Card>

                 <div className="space-y-6">
                     <Card className="p-6">
                        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                            <ImageIcon className="w-5 h-5 text-slate-400" />
                            Custom Cover
                        </h3>
                        <div className="flex items-center gap-4">
                            {customCover ? (
                                <img src={URL.createObjectURL(customCover)} className="w-12 h-16 object-cover rounded shadow" />
                            ) : (
                                <div className="w-12 h-16 bg-slate-100 rounded border border-slate-200" />
                            )}
                            <label className="flex-1">
                                <span className="sr-only">Choose file</span>
                                <input type="file" accept="image/*" onChange={handleCoverUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 transition-colors cursor-pointer"/>
                            </label>
                        </div>
                     </Card>

                     <Card className="p-6">
                        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                            <FolderOpen className="w-5 h-5 text-slate-400" />
                            Restore Session
                        </h3>
                        <label className="flex items-center justify-center w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer transition-colors text-sm font-medium">
                            <span>Select .mtj Backup File</span>
                            <input type="file" className="hidden" accept=".mtj" onChange={handleRestore} />
                        </label>
                     </Card>
                 </div>
             </div>

             {/* Terminal Output on Landing */}
             {systemLogs.length > 0 && (
                 <div className="mt-12 w-full max-w-4xl h-48 rounded-lg overflow-hidden shadow-2xl">
                     <SystemLog logs={systemLogs} />
                 </div>
             )}

             {errorMsg && (
                 <div className="mt-8 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                     <AlertCircle className="w-5 h-5" />
                     {errorMsg}
                 </div>
             )}
        </main>
      </div>
    );
  }

  // --- Dashboard Layout ---
  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col border-r border-slate-800">
            <div className="p-6 flex items-center gap-3 border-b border-slate-800">
                <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white">
                    <Book className="w-5 h-5" />
                </div>
                <span className="font-bold text-white tracking-tight">Mutarjim Pro</span>
            </div>
            
            <div className="p-4 space-y-6 flex-1 overflow-y-auto">
                <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Project</div>
                    <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                        {project?.coverUrl ? (
                            <img src={project.coverUrl} className="w-10 h-14 object-cover rounded shadow-sm" />
                        ) : (
                            <div className="w-10 h-14 bg-slate-700 rounded flex items-center justify-center"><Book className="w-5 h-5 text-slate-500"/></div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate" title={project?.title}>{project?.title}</p>
                            <p className="text-xs text-slate-400 truncate">{project?.author}</p>
                            {project?.arabicTitle && (
                                <p className="text-xs text-emerald-400 font-serif truncate mt-1">{project.arabicTitle}</p>
                            )}
                        </div>
                    </div>
                    <Button variant="ghost" className="w-full justify-start text-xs h-8 mt-1" onClick={() => {
                        setEditArabicTitle(project?.arabicTitle || '');
                        setIsEditModalOpen(true);
                    }}>
                        <Edit3 className="w-3 h-3 mr-2" /> Edit Details
                    </Button>
                </div>

                <div className="space-y-1">
                     <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Translation Stats</div>
                     <div className="px-2">
                        <div className="flex justify-between text-xs mb-1">
                            <span>Progress</span>
                            <span className="text-white">{Math.round((project?.translatedSegments || 0) / (project?.totalSegments || 1) * 100)}%</span>
                        </div>
                        <ProgressBar current={project?.translatedSegments || 0} total={project?.totalSegments || 1} className="h-1.5" />
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <div className="bg-slate-800 p-2 rounded text-center">
                                <div className="text-lg font-bold text-white">{project?.translatedSegments}</div>
                                <div className="text-[10px] text-slate-500 uppercase">Completed</div>
                            </div>
                            <div className="bg-slate-800 p-2 rounded text-center">
                                <div className="text-lg font-bold text-slate-300">{project?.totalSegments}</div>
                                <div className="text-[10px] text-slate-500 uppercase">Total Blocks</div>
                            </div>
                        </div>
                     </div>
                </div>

                <div className="space-y-1">
                     <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Map</div>
                     <div className="h-48 bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                        <SegmentMap segments={segments} />
                     </div>
                </div>
            </div>

            <div className="p-4 border-t border-slate-800 space-y-2">
                 {(appState === AppState.IDLE || appState === AppState.PAUSED || appState === AppState.QUOTA_PAUSED || appState === AppState.ERROR) && (
                     <Button className="w-full" onClick={toggleTranslation}>
                         <Play className="w-4 h-4 mr-2" /> Start Translation
                     </Button>
                 )}
                 {appState === AppState.TRANSLATING && (
                     <Button variant="secondary" className="w-full" onClick={toggleTranslation}>
                         <Pause className="w-4 h-4 mr-2" /> Pause
                     </Button>
                 )}
            </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
            {/* Top Bar */}
            <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shadow-sm z-20">
                 <div className="flex items-center gap-4">
                    <h2 className="font-semibold text-slate-800">Workspace</h2>
                    {appState === AppState.TRANSLATING && <Badge status="TRANSLATING" />}
                    {appState === AppState.PAUSED && <Badge status="PENDING" />}
                    {appState === AppState.COMPLETED && <Badge status="TRANSLATED" />}
                    {appState === AppState.ERROR && <Badge status="FAILED" />}
                    {appState === AppState.QUOTA_PAUSED && <Badge status="QUOTA_PAUSED" />}
                 </div>
                 
                 <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleBackup} title="Download Backup">
                        <Save className="w-4 h-4 mr-2" /> Backup
                    </Button>
                    <Button variant="primary" onClick={handleExport} disabled={appState === AppState.TRANSLATING}>
                        <Download className="w-4 h-4 mr-2" /> Export EPUB
                    </Button>
                 </div>
            </header>

            {/* Content Grid */}
            <div className="flex-1 p-6 overflow-hidden grid grid-rows-[2fr_1fr] gap-6">
                
                {/* Upper: Live Log */}
                <Card className="flex flex-col overflow-hidden shadow-md">
                   <SegmentInspector items={liveLog} />
                </Card>

                {/* Lower: Terminal */}
                <div className="flex flex-col min-h-0">
                    <SystemLog logs={systemLogs} />
                </div>
            </div>
        </main>

        {/* Edit Details Modal */}
        <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Project Details">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Book Title (Original)</Label>
                    <Input disabled value={project?.title} className="bg-slate-50" />
                </div>
                <div className="space-y-2">
                    <Label>Author</Label>
                    <Input disabled value={project?.author} className="bg-slate-50" />
                </div>
                <div className="space-y-2">
                    <Label>Arabic Title (For Export)</Label>
                    <Input 
                        placeholder="e.g. الأمير الصغير" 
                        value={editArabicTitle}
                        onChange={(e) => setEditArabicTitle(e.target.value)}
                        dir="rtl"
                        className="font-serif text-right"
                    />
                    <p className="text-xs text-slate-500">
                        Required for correct file naming: <br/>
                        <code>{editArabicTitle || '<Arabic>'} - {project?.author} (مترجم) [{project?.title}]</code>
                    </p>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                    <Button onClick={saveProjectDetails}>Save Changes</Button>
                </div>
            </div>
        </Modal>

        {/* Error Toast */}
        {errorMsg && (
            <div className="fixed bottom-6 right-6 bg-rose-50 text-rose-800 px-4 py-3 rounded-lg border border-rose-200 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 z-50">
                <AlertCircle className="w-5 h-5" />
                <p className="font-medium text-sm">{errorMsg}</p>
                <button onClick={() => setErrorMsg(null)} className="ml-2 hover:text-rose-950 bg-rose-100 rounded-full p-1 w-6 h-6 flex items-center justify-center">&times;</button>
            </div>
        )}
    </div>
  );
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
}

export default App;