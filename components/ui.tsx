import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Terminal, AlertTriangle, X, Maximize2, Minimize2, Info, GripVertical } from 'lucide-react';
import { Segment, SystemLogEntry } from '../types';

// --- Primitives ---

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'glass', size?: 'sm' | 'md' | 'lg' | 'icon' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 active:scale-95";
    
    const variants = {
      primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-md shadow-brand-500/20 border border-transparent",
      secondary: "bg-white text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-sm",
      outline: "border-2 border-slate-200 bg-transparent hover:border-brand-500 hover:text-brand-600 text-slate-600",
      danger: "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200",
      ghost: "hover:bg-slate-100 text-slate-600",
      glass: "bg-white/80 backdrop-blur-sm border border-white/20 text-slate-800 hover:bg-white/90 shadow-sm",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-6 text-base",
      icon: "h-10 w-10",
    };

    return (
      <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
    );
  }
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={`flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
);

export const Label = ({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label className={`text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block ${className}`} {...props}>
        {children}
    </label>
);

export const Card = ({ children, className, hover = false }: { children?: React.ReactNode; className?: string, hover?: boolean }) => (
  <div className={`rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm ${hover ? 'hover:shadow-md hover:border-brand-200 transition-all duration-300' : ''} ${className}`}>
    {children}
  </div>
);

export const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
                <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 p-1 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

export const Badge = ({ status, className }: { status: string, className?: string }) => {
  const styles: Record<string, string> = {
    PENDING: 'bg-slate-100 text-slate-600 border-slate-200',
    TRANSLATING: 'bg-brand-50 text-brand-700 border-brand-200',
    TRANSLATED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
    QUOTA_PAUSED: 'bg-amber-50 text-amber-700 border-amber-200',
    SKIPPED: 'bg-slate-50 text-slate-500 border-slate-200 dashed-border',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${styles[status] || styles.PENDING} ${className}`}>
      {status === 'TRANSLATING' && <Spinner className="w-3 h-3 mr-1.5 text-brand-600" />}
      {status}
    </span>
  );
};

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={`animate-spin ${className}`} />;

// --- Complex Components ---

export const ProgressBar = ({ current, total, className, minimal = false }: { current: number; total: number; className?: string, minimal?: boolean }) => {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className={`w-full ${className}`}>
        {!minimal && (
            <div className="flex justify-between text-xs mb-2 font-medium text-slate-500">
                <span>Progress</span>
                <span className="text-slate-700">{percent}%</span>
            </div>
        )}
      <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
        <div
          className="bg-brand-500 h-full rounded-full transition-all duration-500 ease-out relative"
          style={{ width: `${percent}%` }}
        >
            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

export const SegmentMap = ({ segments, onClickSegment }: { segments: Segment[], onClickSegment?: (s: Segment) => void }) => {
  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-1">
        {segments.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-400 text-xs italic">
                No data
            </div>
        ) : (
            <div className="flex flex-wrap gap-[2px]">
            {segments.map((s, i) => {
                let bg = 'bg-slate-200 hover:bg-slate-300';
                if (s.status === 'TRANSLATING') bg = 'bg-brand-400 animate-pulse';
                if (s.status === 'TRANSLATED') bg = 'bg-emerald-400 hover:bg-emerald-500';
                if (s.status === 'FAILED') bg = 'bg-rose-400 hover:bg-rose-500';
                if (s.status === 'SKIPPED') bg = 'bg-amber-200 hover:bg-amber-300';
                
                return (
                    <div 
                        key={s.id} 
                        className={`w-2 h-2 rounded-[1px] cursor-pointer transition-colors duration-150 ${bg}`} 
                        title={`#${i}: ${s.status}`}
                        onClick={() => onClickSegment && onClickSegment(s)}
                    />
                );
            })}
            </div>
        )}
    </div>
  );
};

export const SystemLog = ({ logs, isOpen, toggle }: { logs: SystemLogEntry[], isOpen: boolean, toggle: () => void }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  return (
    <div className={`bg-slate-900 border-t border-slate-800 flex flex-col transition-all duration-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20 ${isOpen ? 'h-64' : 'h-10'}`}>
        <div 
            onClick={toggle}
            className="h-10 flex items-center justify-between px-4 cursor-pointer hover:bg-slate-800 transition-colors shrink-0 group"
        >
            <div className="flex items-center gap-3 text-xs font-mono text-slate-400 group-hover:text-slate-300">
                <div className={`p-1 rounded ${isOpen ? 'bg-slate-800' : 'bg-slate-800/50'}`}>
                   <Terminal className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold uppercase tracking-wider">System Console</span>
                {logs.length > 0 && <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-500">{logs.length}</span>}
                {!isOpen && logs.length > 0 && (
                    <span className="text-slate-600 truncate max-w-[300px] border-l border-slate-700 pl-3 ml-1 opacity-70">
                        {logs[logs.length-1].message}
                    </span>
                )}
            </div>
            <div className="text-slate-600 group-hover:text-slate-400">
                {isOpen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </div>
        </div>

        {isOpen && (
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs text-slate-300 bg-slate-950/50">
                {logs.map((log) => (
                <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded-sm transition-colors">
                    <span className="text-slate-600 shrink-0 select-none w-14 text-right">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                    </span>
                    <span className={`break-words flex-1 ${
                    log.type === 'ERROR' ? 'text-rose-400' :
                    log.type === 'SUCCESS' ? 'text-emerald-400' :
                    log.type === 'WARNING' ? 'text-amber-400' :
                    'text-slate-300'
                    }`}>
                    {log.type === 'ERROR' && <span className="mr-1 inline-block text-rose-500">✖</span>}
                    {log.type === 'SUCCESS' && <span className="mr-1 inline-block text-emerald-500">✔</span>}
                    {log.type === 'WARNING' && <span className="mr-1 inline-block text-amber-500">⚠</span>}
                    {log.message}
                    </span>
                </div>
                ))}
            </div>
        )}
    </div>
  );
};

export const BookPage = ({ title, content, lang = 'en', isLoading = false, isEmpty = false, fontSize = 18, fontType = 'serif' }: { title: string, content: string | null, lang?: 'en' | 'ar', isLoading?: boolean, isEmpty?: boolean, fontSize?: number, fontType?: 'serif' | 'sans' }) => {
    
    const fontClass = lang === 'ar' 
        ? (fontType === 'serif' ? 'font-arabicSerif' : 'font-arabic')
        : (fontType === 'serif' ? 'font-serif' : 'font-sans');

    return (
        <div className="flex flex-col h-full bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden relative group transition-all duration-300 hover:shadow-md hover:border-brand-200/50">
            <div className="h-10 border-b border-slate-100 flex items-center justify-between px-4 bg-slate-50/80 backdrop-blur-sm shrink-0">
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                     {lang === 'ar' ? <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
                     {title}
                 </span>
                 <div className="flex items-center gap-2">
                     <span className="text-[10px] text-slate-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                         {fontSize}px • {fontType}
                     </span>
                 </div>
            </div>
            
            <div className={`flex-1 overflow-y-auto p-8 custom-scrollbar relative ${lang === 'ar' ? 'text-right' : 'text-left'}`}>
                {isEmpty && !isLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 select-none">
                        <div className="w-16 h-16 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center mb-4 bg-slate-50">
                            <Info className="w-6 h-6 text-slate-300" />
                        </div>
                        <p className="text-sm font-medium">No content loaded</p>
                    </div>
                )}
                
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[2px] z-10 animate-in fade-in duration-300">
                        <div className="flex flex-col items-center gap-3 bg-white p-6 rounded-2xl shadow-xl border border-slate-100">
                            <Spinner className="w-8 h-8 text-brand-600" />
                            <p className="text-xs font-bold text-brand-600 animate-pulse tracking-wide uppercase">Translating Segment...</p>
                        </div>
                    </div>
                )}

                <div 
                    className={`book-content prose prose-slate max-w-none leading-loose transition-all duration-200 ease-in-out ${fontClass}`} 
                    style={{ fontSize: `${fontSize}px` }}
                    dangerouslySetInnerHTML={{ __html: content || '' }} 
                />
            </div>
        </div>
    )
}

export const SplitView = ({ original, translated, isTranslating, fontSize, fontType }: { original: string, translated: string | null, isTranslating: boolean, fontSize: number, fontType: 'serif' | 'sans' }) => {
    const [ratio, setRatio] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            let newRatio = ((moveEvent.clientX - rect.left) / rect.width) * 100;
            newRatio = Math.max(20, Math.min(80, newRatio));
            setRatio(newRatio);
        };

        const onMouseUp = () => {
            setIsDragging(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    return (
        <div ref={containerRef} className="flex h-full w-full gap-4 relative isolate">
            <div style={{ width: `calc(${ratio}% - 8px)` }} className="h-full min-w-0 transition-[width] duration-75 ease-linear">
                <BookPage 
                    title="Original Source" 
                    content={original} 
                    lang="en" 
                    fontSize={fontSize} 
                    fontType={fontType} 
                />
            </div>
            
            <div 
                className={`w-4 -ml-2 -mr-2 cursor-col-resize z-10 flex items-center justify-center group select-none`}
                onMouseDown={handleMouseDown}
            >
                <div className={`w-1 h-12 rounded-full transition-all duration-300 ${isDragging ? 'bg-brand-500 h-16 w-1.5' : 'bg-slate-200 group-hover:bg-brand-400'}`} />
            </div>

            <div style={{ width: `calc(${100 - ratio}% - 8px)` }} className="h-full min-w-0 transition-[width] duration-75 ease-linear">
                <BookPage 
                    title="Arabic Translation" 
                    content={translated} 
                    lang="ar" 
                    isLoading={isTranslating} 
                    isEmpty={!translated}
                    fontSize={fontSize}
                    fontType={fontType}
                />
            </div>
        </div>
    )
}