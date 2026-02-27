import React, { useEffect, useRef, useState, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { Loader2, Terminal, AlertTriangle, X, Maximize2, Minimize2, Info, GripVertical, Bot, Activity, ChevronRight, ChevronDown, FileJson, ShieldAlert, Copy, Check, Edit3, RotateCcw } from 'lucide-react';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { Segment, SystemLogEntry, AIDebugLogEntry } from '../types';
import { cn } from '../lib/utils';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 p-6 text-center">
          <ShieldAlert className="w-16 h-16 text-rose-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md">
            An unexpected error occurred in the application. Please try refreshing the page or clearing your browser data if the issue persists.
          </p>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-left w-full max-w-2xl overflow-auto max-h-64 shadow-sm">
            <pre className="text-xs text-rose-600 dark:text-rose-400 font-mono whitespace-pre-wrap">
              {this.state.error?.toString()}
            </pre>
          </div>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Reload Application
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Primitives ---

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'glass', size?: 'sm' | 'md' | 'lg' | 'icon' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";
    
    const variants = {
      primary: "bg-sky-500 text-white hover:bg-sky-600 shadow-sm border border-transparent dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-900",
      secondary: "bg-white text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-sm dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700",
      outline: "border-2 border-slate-200 bg-transparent hover:border-sky-500 hover:text-sky-600 text-slate-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-400 dark:hover:text-sky-400",
      danger: "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50 dark:hover:bg-rose-900/40",
      ghost: "hover:bg-slate-100 text-slate-600 dark:hover:bg-slate-800 dark:text-slate-300",
      glass: "bg-white/80 backdrop-blur-sm border border-white/20 text-slate-800 hover:bg-white/90 shadow-sm dark:bg-slate-800/80 dark:border-slate-700/50 dark:text-slate-200 dark:hover:bg-slate-800",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-6 text-base",
      icon: "h-10 w-10",
    };

    return (
      <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
    );
  }
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={cn("flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-50 dark:ring-offset-slate-900 dark:placeholder:text-slate-500", className)}
        ref={ref}
        {...props}
      />
    )
  }
);

export const Label = ({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block", className)} {...props}>
      {children}
  </label>
);

export const Card = ({ children, className, hover = false }: { children?: React.ReactNode; className?: string, hover?: boolean }) => (
  <div className={cn("rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-50", hover && "hover:shadow-md hover:border-sky-200 dark:hover:border-sky-800 transition-all duration-300", className)}>
    {children}
  </div>
);

export const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-lg" }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode; maxWidth?: string }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
                >
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ type: "spring", duration: 0.3 }}
                        className={cn("bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full overflow-hidden border border-slate-100 dark:border-slate-700 max-h-[90vh] flex flex-col", maxWidth)}
                    >
                        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
                            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 p-1 rounded-full transition-colors" aria-label="Close modal">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            {children}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export const Badge = ({ status, className }: { status: string, className?: string }) => {
  const styles: Record<string, string> = {
    PENDING: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    TRANSLATING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50',
    TRANSLATED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50',
    FAILED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50',
    QUOTA_PAUSED: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50',
    SKIPPED: 'bg-slate-50 text-slate-500 border-slate-200 dashed-border dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700',
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border", styles[status] || styles.PENDING, className)}>
      {status === 'TRANSLATING' && <Spinner className="w-3 h-3 mr-1.5 text-amber-600 dark:text-amber-400" />}
      {status}
    </span>
  );
};

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={`animate-spin ${className}`} />;

// --- Complex Components ---

export const ProgressBar = ({ current, total, className, minimal = false }: { current: number; total: number; className?: string, minimal?: boolean }) => {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className={cn("w-full", className)}>
        {!minimal && (
            <div className="flex justify-between text-xs mb-2 font-medium text-slate-500 dark:text-slate-400">
                <span>Progress</span>
                <span className="text-slate-700 dark:text-slate-300">{percent}%</span>
            </div>
        )}
      <div className="bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
        <motion.div
          className="bg-sky-500 h-full rounded-full relative"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
        </motion.div>
      </div>
    </div>
  );
};

export const SegmentMap = React.memo(({ segments, onClickSegment }: { segments: Segment[], onClickSegment?: (s: Segment) => void }) => {
  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-1">
        {segments.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-500 text-xs italic">
                No data
            </div>
        ) : (
            <div className="flex flex-wrap gap-[2px] content-start">
            {segments.map((s, i) => {
                let bg = 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600';
                if (s.status === 'TRANSLATING') bg = 'bg-amber-400 dark:bg-amber-500 animate-pulse';
                else if (s.status === 'TRANSLATED') bg = 'bg-emerald-400 dark:bg-emerald-500 hover:bg-emerald-500 dark:hover:bg-emerald-400';
                else if (s.status === 'FAILED') bg = 'bg-rose-400 dark:bg-rose-500 hover:bg-rose-500 dark:hover:bg-rose-400';
                else if (s.status === 'SKIPPED') bg = 'bg-amber-300 dark:bg-amber-400 hover:bg-amber-400 dark:hover:bg-amber-300';
                
                return (
                    <div 
                        key={s.id} 
                        className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-[1px] cursor-pointer transition-colors duration-150 ${bg}`} 
                        title={`Segment ${i + 1} (${s.status})`}
                        onClick={() => onClickSegment && onClickSegment(s)}
                    />
                );
            })}
            </div>
        )}
    </div>
  );
});

const AILogRow: React.FC<{ log: AIDebugLogEntry }> = ({ log }) => {
    const [expanded, setExpanded] = useState(false);
    
    return (
        <div className={`rounded-sm transition-colors ${expanded ? 'bg-white/5' : 'hover:bg-white/5'}`}>
            <div 
                onClick={() => log.data && setExpanded(!expanded)} 
                className={`flex gap-3 p-1 ${log.data ? 'cursor-pointer' : ''}`}
            >
                <span className="text-sky-400/60 shrink-0 select-none w-16 text-right text-[10px] pt-0.5 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                </span>
                
                <div className="flex-1 flex gap-2 overflow-hidden">
                    {log.data ? (
                        <div className="mt-0.5 text-slate-500 shrink-0">
                            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </div>
                    ) : (
                        <div className="w-3 shrink-0"></div>
                    )}

                    <div className="flex-1 min-w-0">
                        <span className={`block truncate ${
                            log.type === 'ERROR' ? 'text-rose-400' :
                            log.type === 'SUCCESS' ? 'text-emerald-400' :
                            log.type === 'WARNING' ? 'text-amber-400' :
                            'text-sky-200'
                        }`}>
                            {log.message}
                        </span>
                    </div>
                </div>
            </div>
            
            {expanded && log.data && (
                <div className="pl-20 pr-4 pb-2 text-[10px]">
                    <div className="bg-slate-900 rounded border border-white/10 p-2 overflow-x-auto relative group/code">
                        <pre className="text-slate-400 font-mono whitespace-pre-wrap break-all">
                            {JSON.stringify(log.data, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

export const Console = React.memo(({ systemLogs, aiLogs, isOpen, toggle }: { systemLogs: SystemLogEntry[], aiLogs: AIDebugLogEntry[], isOpen: boolean, toggle: () => void }) => {
  const [tab, setTab] = useState<'SYSTEM' | 'AI'>('SYSTEM');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [height, setHeight] = useState(288); // Default 72 * 4 = 288px
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);

  // Auto-scroll logic
  useEffect(() => {
    if (scrollRef.current && autoScroll && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [systemLogs, aiLogs, isOpen, tab, autoScroll]);

  const handleScroll = () => {
      if (!scrollRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // If user scrolls up, disable autoscroll. If they are near bottom, enable it.
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 100 && newHeight < window.innerHeight - 100) {
        setHeight(newHeight);
      }
    };
    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div 
        className={`bg-slate-900 border-t border-slate-800 flex flex-col shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20 relative ${!isResizing ? 'transition-[height] duration-300' : ''}`} 
        style={{ height: isOpen ? `${height}px` : '40px' }}
    >
        {isOpen && (
            <div 
                className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-sky-500/50 z-30 transition-colors"
                onMouseDown={startResizing}
            />
        )}
        
        {/* Header Bar */}
        <div className="h-10 flex items-center justify-between px-2 bg-slate-950/50 border-b border-white/5 shrink-0">
            <div className="flex items-center">
                 <button 
                    onClick={toggle}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded-md transition-colors mr-2 text-slate-400 hover:text-slate-300"
                 >
                    <Terminal className="w-4 h-4" />
                    <span className="text-xs font-bold tracking-wider uppercase font-sans">Console</span>
                 </button>

                 <div className="h-4 w-px bg-white/10 mx-2"></div>
                 
                 <div className="flex bg-slate-900 rounded p-0.5 border border-white/5">
                     <button 
                        onClick={() => { setTab('SYSTEM'); setAutoScroll(true); }}
                        className={`flex items-center gap-2 px-3 py-1 rounded-[3px] text-[10px] font-medium transition-all font-sans ${tab === 'SYSTEM' ? 'bg-slate-800 text-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
                     >
                         <Activity className="w-3 h-3" />
                         <span>System</span>
                         {systemLogs.length > 0 && <span className="bg-slate-700/50 px-1.5 rounded-full text-[9px] ml-1">{systemLogs.length}</span>}
                     </button>
                     <button 
                        onClick={() => { setTab('AI'); setAutoScroll(true); }}
                        className={`flex items-center gap-2 px-3 py-1 rounded-[3px] text-[10px] font-medium transition-all font-sans ${tab === 'AI' ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20 shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
                     >
                         <Bot className="w-3 h-3" />
                         <span>AI Trace</span>
                         {aiLogs.length > 0 && <span className="bg-sky-500/20 px-1.5 rounded-full text-[9px] text-sky-200 ml-1">{aiLogs.length}</span>}
                     </button>
                 </div>
            </div>

            <div className="flex items-center gap-2">
                 {!isOpen && (
                     <div className="flex items-center gap-2 text-[10px] text-slate-500 mr-4 font-mono">
                        {tab === 'SYSTEM' && systemLogs.length > 0 && <span className="truncate max-w-[200px] opacity-70 border-l border-slate-700 pl-2">{systemLogs[systemLogs.length-1].message}</span>}
                        {tab === 'AI' && aiLogs.length > 0 && <span className="truncate max-w-[200px] opacity-70 border-l border-slate-700 pl-2">{aiLogs[aiLogs.length-1].message}</span>}
                     </div>
                 )}
                 <button onClick={toggle} className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-white/5 transition-colors">
                    {isOpen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                 </button>
            </div>
        </div>

        {/* Content */}
        {isOpen && (
            <div 
                ref={scrollRef} 
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs bg-slate-950 custom-scrollbar"
            >
                {tab === 'SYSTEM' ? (
                    systemLogs.length === 0 ? <div className="text-slate-700 italic px-2">No system logs.</div> :
                    systemLogs.map((log) => (
                        <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded-sm transition-colors group">
                            <span className="text-slate-600 shrink-0 select-none w-16 text-right text-[10px] pt-0.5">
                                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                            </span>
                            <span className={`break-words flex-1 ${
                            log.type === 'ERROR' ? 'text-rose-400' :
                            log.type === 'SUCCESS' ? 'text-emerald-400' :
                            log.type === 'WARNING' ? 'text-amber-400' :
                            'text-slate-300'
                            }`}>
                            {log.type === 'ERROR' && <span className="mr-2 inline-block text-rose-500 font-bold">✖</span>}
                            {log.type === 'SUCCESS' && <span className="mr-2 inline-block text-emerald-500 font-bold">✔</span>}
                            {log.type === 'WARNING' && <span className="mr-2 inline-block text-amber-500 font-bold">⚠</span>}
                            {log.message}
                            </span>
                        </div>
                    ))
                ) : (
                    aiLogs.length === 0 ? <div className="text-slate-700 italic px-2">No AI logs recorded.</div> :
                    aiLogs.map((log) => (
                        <AILogRow key={log.id} log={log} />
                    ))
                )}
            </div>
        )}
    </div>
  );
});

export const BookPage = React.memo(({ title, content, lang = 'en', isLoading = false, isEmpty = false, fontSize = 18, fontType = 'serif' }: { title: string, content: string | null, lang?: 'en' | 'ar', isLoading?: boolean, isEmpty?: boolean, fontSize?: number, fontType?: 'serif' | 'sans' }) => {
    
    const fontClass = lang === 'ar' 
        ? (fontType === 'serif' ? 'font-arabicSerif' : 'font-arabic')
        : (fontType === 'serif' ? 'font-serif' : 'font-sans');

    const sanitizedContent = useMemo(() => DOMPurify.sanitize(content || ''), [content]);

    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        if (!content) return;
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden relative transition-all duration-300">
            <div className="h-12 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between px-4 bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm shrink-0">
                 <div className="flex items-center gap-3">
                     <div className={`w-2 h-2 rounded-full ${lang === 'ar' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]'}`} />
                     <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                         {title}
                     </span>
                 </div>
                 <div className="flex items-center gap-3">
                     <button onClick={handleCopy} disabled={!content} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50" title="Copy HTML">
                         {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                     </button>
                 </div>
            </div>
            
            <div className={`flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative ${lang === 'ar' ? 'text-right' : 'text-left'}`}>
                {isEmpty && !isLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 select-none">
                        <div className="w-16 h-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center mb-4 bg-slate-50 dark:bg-slate-800/50">
                            <Info className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-sm font-medium">No content loaded</p>
                    </div>
                )}
                
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-[2px] z-10 animate-in fade-in duration-300">
                        <div className="flex flex-col items-center gap-3 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700">
                            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                            <p className="text-xs font-bold text-sky-500 tracking-wide uppercase">Translating Segment...</p>
                        </div>
                    </div>
                )}

                <div 
                    className={`book-content prose prose-slate dark:prose-invert max-w-none leading-loose transition-all duration-200 ease-in-out ${fontClass}`} 
                    style={{ fontSize: `${fontSize}px` }}
                    dangerouslySetInnerHTML={{ __html: sanitizedContent }} 
                />
            </div>
        </div>
    )
});

export function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return isMobile;
}

export const SplitView = React.memo(({ original, translated, onTranslatedChange, isTranslating, fontSize, fontType }: { original: string, translated: string | null, onTranslatedChange: (val: string) => void, isTranslating: boolean, fontSize: number, fontType: 'serif' | 'sans' }) => {
    const [ratio, setRatio] = useState(() => {
        const saved = localStorage.getItem('mutarjim-split-ratio');
        return saved ? parseFloat(saved) : 50;
    });
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [copied, setCopied] = useState(false);
    const isMobile = useIsMobile();

    const handleCopy = () => {
        if (!translated) return;
        navigator.clipboard.writeText(translated);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (isMobile) return;
        e.preventDefault();
        setIsDragging(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        const onMove = (moveEvent: MouseEvent | TouchEvent) => {
            if (!containerRef.current) return;
            const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const rect = containerRef.current.getBoundingClientRect();
            let newRatio = ((clientX - rect.left) / rect.width) * 100;
            newRatio = Math.max(20, Math.min(80, newRatio));
            setRatio(newRatio);
        };

        const onUp = () => {
            setIsDragging(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
            localStorage.setItem('mutarjim-split-ratio', ratio.toString());
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    };

    const fontClass = fontType === 'serif' ? 'font-arabicSerif' : 'font-arabic';

    return (
        <div ref={containerRef} className="flex flex-col md:flex-row h-full w-full gap-2 relative isolate">
            <div style={isMobile ? { flex: 1 } : { width: `calc(${ratio}% - 4px)` }} className="min-w-0 transition-[width] duration-75 ease-linear">
                <BookPage 
                    title="Original Source" 
                    content={original} 
                    lang="en" 
                    fontSize={fontSize} 
                    fontType={fontType} 
                />
            </div>
            
            {!isMobile && (
                <div 
                    className={`w-4 -ml-2 -mr-2 cursor-col-resize z-10 flex items-center justify-center group select-none`}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleMouseDown}
                >
                    <div className={`w-1.5 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${isDragging ? 'bg-sky-500 scale-y-110' : 'bg-slate-200 dark:bg-slate-700 group-hover:bg-sky-400'}`}>
                        <GripVertical className={`w-3 h-4 ${isDragging ? 'text-white' : 'text-slate-400 dark:text-slate-500 group-hover:text-white'} transition-colors`} />
                    </div>
                </div>
            )}

            <div style={isMobile ? { flex: 1 } : { width: `calc(${100 - ratio}% - 4px)` }} className="min-w-0 transition-[width] duration-75 ease-linear">
                <div className="flex flex-col h-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden relative transition-all duration-300">
                    <div className="h-12 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between px-4 bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                Arabic Translation
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={handleCopy} disabled={!translated} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50" title="Copy HTML">
                                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 relative bg-slate-50/30 dark:bg-slate-900/30 overflow-y-auto custom-scrollbar">
                        {(!translated && !isTranslating) && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 select-none pointer-events-none">
                                <div className="w-16 h-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center mb-4 bg-slate-50 dark:bg-slate-800/50">
                                    <Info className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                                </div>
                                <p className="text-sm font-medium">No content loaded</p>
                            </div>
                        )}
                        
                        {isTranslating && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-[2px] z-10 animate-in fade-in duration-300">
                                <div className="flex flex-col items-center gap-3 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700">
                                    <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                                    <p className="text-xs font-bold text-sky-500 tracking-wide uppercase">Translating Segment...</p>
                                </div>
                            </div>
                        )}

                        <div
                            key={original}
                            className={`w-full min-h-full resize-none bg-transparent border-none focus:ring-0 p-4 md:p-8 text-right outline-none text-slate-900 dark:text-slate-50 ${fontClass} prose prose-slate dark:prose-invert max-w-none leading-loose focus:bg-white dark:focus:bg-slate-800 transition-colors duration-300`}
                            style={{ fontSize: `${fontSize}px` }}
                            contentEditable={!isTranslating}
                            suppressContentEditableWarning
                            onBlur={(e) => onTranslatedChange(e.currentTarget.innerHTML)}
                            dangerouslySetInnerHTML={{ __html: translated || '' }}
                            dir="rtl"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
});
