import React, { useEffect, useRef } from 'react';
import { Loader2, Terminal, CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { Segment, SegmentStatus, SystemLogEntry, LiveLogItem } from '../types';

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2";
    const variants = {
      primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-200",
      secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200",
      outline: "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700",
      danger: "bg-rose-600 text-white hover:bg-rose-700",
      ghost: "hover:bg-slate-100 text-slate-700 bg-transparent border-none shadow-none",
    };
    return (
      <button ref={ref} className={`${base} ${variants[variant]} ${className}`} {...props} />
    );
  }
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={`flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
);

export const Label = ({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-700 ${className}`} {...props}>
        {children}
    </label>
);

export const Card = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm ${className}`}>
    {children}
  </div>
);

export const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-semibold text-slate-900">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
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

export const ProgressBar = ({ current, total, className }: { current: number; total: number; className?: string }) => {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className={`w-full bg-slate-100 rounded-full h-2 ${className}`}>
      <div
        className="bg-brand-600 h-2 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(14,165,233,0.3)]"
        style={{ width: `${percent}%` }}
      ></div>
    </div>
  );
};

export const Badge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    PENDING: 'bg-slate-100 text-slate-600 ring-slate-500/10',
    TRANSLATING: 'bg-blue-50 text-blue-700 ring-blue-700/10',
    TRANSLATED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    FAILED: 'bg-rose-50 text-rose-700 ring-rose-600/10',
    QUOTA_PAUSED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    SKIPPED: 'bg-slate-100 text-slate-500 ring-slate-500/10',
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${styles[status] || styles.PENDING}`}>
      {status}
    </span>
  );
};

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={`h-4 w-4 animate-spin ${className}`} />;

export const SegmentMap = ({ segments }: { segments: Segment[] }) => {
  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-2">
        {segments.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-400 text-sm italic">
                No segments found
            </div>
        ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8px,1fr))] gap-[1px] auto-rows-[8px]">
            {segments.map((s, i) => {
                let bg = 'bg-slate-200';
                if (s.status === 'TRANSLATING') bg = 'bg-blue-400 animate-pulse';
                if (s.status === 'TRANSLATED') bg = 'bg-emerald-500';
                if (s.status === 'FAILED') bg = 'bg-rose-500';
                if (s.status === 'SKIPPED') bg = 'bg-slate-300';
                
                return (
                    <div 
                        key={s.id} 
                        className={`rounded-[1px] transition-colors duration-300 ${bg}`} 
                        title={`Segment ${i + 1}: ${s.status}`}
                    />
                );
            })}
            </div>
        )}
    </div>
  );
};

export const SystemLog = ({ logs }: { logs: SystemLogEntry[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-full h-full flex flex-col bg-[#0F172A] rounded-lg shadow-lg overflow-hidden border border-slate-800 font-mono">
      <div className="bg-[#1E293B] px-4 py-2 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <Terminal className="w-3.5 h-3.5 text-slate-400" />
           <span className="text-xs font-semibold text-slate-300 tracking-wide">SYSTEM OUTPUT</span>
        </div>
        <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
        </div>
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto terminal-scrollbar p-4 text-xs space-y-2"
      >
        {logs.length === 0 && (
           <div className="text-slate-600 italic">Mutarjim Pro System v1.0. Ready.</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 group">
             <span className="text-slate-600 shrink-0 select-none group-hover:text-slate-500 transition-colors">
               [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]
             </span>
             <span className={`break-words ${
               log.type === 'ERROR' ? 'text-rose-400' :
               log.type === 'SUCCESS' ? 'text-emerald-400' :
               log.type === 'WARNING' ? 'text-amber-400' :
               'text-slate-300'
             }`}>
               {log.type === 'ERROR' && '✖ '}
               {log.type === 'SUCCESS' && '✔ '}
               {log.type === 'WARNING' && '⚠ '}
               {log.message}
             </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SegmentInspector = ({ items }: { items: LiveLogItem[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items]);

  return (
    <div className="h-full flex flex-col bg-slate-50">
       <div className="p-3 bg-white border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Translation Log
          </span>
          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-medium">
            {items.length} events
          </span>
       </div>
       <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4"
       >
          {items.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm space-y-3 opacity-60">
                <Info className="w-10 h-10 stroke-1" />
                <p className="font-light">Waiting for translation stream...</p>
             </div>
          )}
          
          {items.map((item) => {
             const isTranslated = item.status === SegmentStatus.TRANSLATED;
             const isFailed = item.status === SegmentStatus.FAILED;
             const isProcessing = item.status === SegmentStatus.TRANSLATING || item.status === SegmentStatus.PENDING;
             const isSkipped = item.status === SegmentStatus.SKIPPED;

             let borderClass = "border-slate-200";
             let bgClass = "bg-white";
             
             if (isTranslated) { borderClass = "border-emerald-200"; bgClass = "bg-emerald-50/30"; }
             if (isFailed) { borderClass = "border-rose-200"; bgClass = "bg-rose-50/30"; }
             if (isProcessing) { borderClass = "border-brand-200"; bgClass = "bg-white"; }

             return (
               <div key={item.id} className={`p-4 rounded-lg border ${borderClass} ${bgClass} shadow-sm transition-all duration-300`}>
                  <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-2">
                     <span className="text-[10px] font-mono text-slate-400">
                        ID: {item.id.split('::').pop()}
                     </span>
                     <div>
                        {isProcessing && <span className="flex items-center gap-1.5 text-[10px] text-brand-600 font-semibold uppercase tracking-wider"><Spinner className="w-3 h-3"/> Translating</span>}
                        {isTranslated && <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold uppercase tracking-wider"><CheckCircle2 className="w-3.5 h-3.5"/> Completed</span>}
                        {isFailed && <span className="flex items-center gap-1.5 text-[10px] text-rose-600 font-semibold uppercase tracking-wider"><XCircle className="w-3.5 h-3.5"/> Failed</span>}
                        {isSkipped && <span className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wider"><AlertTriangle className="w-3.5 h-3.5"/> Skipped</span>}
                     </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                     {/* Original Text */}
                     <div className="text-sm font-sans text-slate-600 leading-relaxed">
                        <div dangerouslySetInnerHTML={{ __html: item.orig }} />
                     </div>

                     {/* Translated Text */}
                     {isTranslated && item.trans && (
                        <div dir="rtl" className="text-base font-serif text-slate-900 leading-loose text-right bg-white/50 p-2 rounded border-r-4 border-emerald-400">
                           <div dangerouslySetInnerHTML={{ __html: item.trans }} />
                        </div>
                     )}

                     {isProcessing && (
                        <div className="space-y-2 mt-2">
                            <div className="h-2 w-full bg-slate-100 rounded animate-pulse" />
                            <div className="h-2 w-2/3 bg-slate-100 rounded animate-pulse" />
                        </div>
                     )}

                     {isFailed && (
                        <div className="text-rose-600 text-xs mt-1 font-medium bg-rose-50 p-2 rounded">
                           Error: {item.error}
                        </div>
                     )}
                  </div>
               </div>
             );
          })}
       </div>
    </div>
  );
};