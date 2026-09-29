import React, { useCallback, useRef, useEffect } from 'react';
import { AppState, Segment, SegmentStatus, LogType, ProjectData, GlossaryTerm } from '../types';
import { dbService } from '../services/db';
import { geminiService, isQuotaError } from '../services/geminiService';

const playRingSound = () => {
    try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        const playTone = (freq: number, startTime: number, duration: number) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            
            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        const now = audioCtx.currentTime;
        playTone(880, now, 0.4); // A5
        playTone(659.25, now + 0.3, 0.6); // E5
    } catch (e) {
        console.error("Audio playback failed", e);
    }
};

export const useTranslationProcessor = (
    appState: AppState,
    setAppState: React.Dispatch<React.SetStateAction<AppState>>,
    segmentsRef: React.MutableRefObject<Segment[]>,
    setSegments: React.Dispatch<React.SetStateAction<Segment[]>>,
    setProject: React.Dispatch<React.SetStateAction<ProjectData | null>>,
    setActiveSegmentIndex: React.Dispatch<React.SetStateAction<number>>,
    addLog: (msg: string, type?: LogType) => void,
    addAiLog: (msg: string, type?: LogType, data?: any) => void,
    translationMode: 'normal' | 'second_mode' = 'normal',
    glossaryRef?: React.MutableRefObject<GlossaryTerm[]>,
    setGlossary?: React.Dispatch<React.SetStateAction<GlossaryTerm[]>>,
    setIsScanningGlossary?: React.Dispatch<React.SetStateAction<boolean>>
) => {
    const processingRef = useRef<boolean>(false);
    const runTokenRef = useRef<number>(0);
    const discoveryQueueRef = useRef<Array<{ originalHtml: string; translatedHtml: string }>>([]);
    const isProcessingDiscoveryQueueRef = useRef<boolean>(false);

    const enqueueLiveGlossaryDiscovery = useCallback(
        (originalHtml: string, translatedHtml: string) => {
            discoveryQueueRef.current.push({ originalHtml, translatedHtml });
            if (isProcessingDiscoveryQueueRef.current) return;

            isProcessingDiscoveryQueueRef.current = true;
            const drainQueue = async () => {
                while (discoveryQueueRef.current.length > 0 && processingRef.current) {
                    const item = discoveryQueueRef.current.shift();
                    if (!item) break;

                    try {
                        const currentTerms = glossaryRef ? glossaryRef.current : [];
                        const newTerms = await geminiService.extractNewTermsFromSegment(
                            item.originalHtml,
                            item.translatedHtml,
                            currentTerms,
                            (msg, type, data) => addAiLog(msg, type, data)
                        );
                        if (newTerms.length > 0) {
                            const merged = await dbService.saveGlossaryTerms(newTerms, false);
                            if (glossaryRef) glossaryRef.current = merged;
                            setGlossary?.(merged);
                        }
                    } catch {
                        // Non-blocking background pass
                    }
                }
                isProcessingDiscoveryQueueRef.current = false;
            };

            drainQueue();
        },
        [addAiLog, glossaryRef, setGlossary]
    );

    const processQueue = useCallback(async () => {
        if (processingRef.current) return;
        processingRef.current = true;
        runTokenRef.current += 1;
        const currentRunToken = runTokenRef.current;
        addLog("Processor started.", 'INFO');

        // Phase A: Automatic Pre-Translation Glossary Extraction (if not yet initialized for this project)
        try {
            const currentProj = await dbService.getProject();
            if (currentProj && !currentProj.glossaryInitialized && segmentsRef.current.length > 0) {
                setIsScanningGlossary?.(true);
                addLog("Auto-scanning book to extract names, places, titles, and recurring concepts...", 'INFO');
                const scanResult = await geminiService.extractInitialBookGlossary(
                    segmentsRef.current,
                    currentProj.title,
                    (msg, type, data) => addAiLog(msg, type, data)
                );

                if (scanResult.succeeded) {
                    if (scanResult.terms.length > 0) {
                        const updatedGlossary = await dbService.saveGlossaryTerms(scanResult.terms, false);
                        if (glossaryRef) glossaryRef.current = updatedGlossary;
                        setGlossary?.(updatedGlossary);
                        addLog(`Book Glossary initialized with ${updatedGlossary.length} recurring terms.`, 'SUCCESS');
                    } else {
                        addLog("Initial glossary scan finished.", 'INFO');
                    }

                    const markedProj: ProjectData = { ...currentProj, glossaryInitialized: true };
                    await dbService.saveProject(markedProj);
                    setProject(markedProj);
                } else if (scanResult.quotaExhausted) {
                    setAppState(AppState.QUOTA_PAUSED);
                    addLog("API Quota hit during initial glossary scan. Pausing.", 'WARNING');
                    playRingSound();
                    processingRef.current = false;
                    return;
                } else {
                    addLog("Glossary pre-scan could not complete; will retry on next run. Proceeding with translation.", 'WARNING');
                }
            }
        } catch (err) {
            console.warn("Pre-translation glossary scan encountered an error:", err);
            addLog("Glossary pre-scan skipped due to error; proceeding with translation.", 'WARNING');
        } finally {
            setIsScanningGlossary?.(false);
        }

        if (!processingRef.current || runTokenRef.current !== currentRunToken) {
            processingRef.current = false;
            return;
        }

        const CONCURRENCY = 5;
        let activeWorkers = 0;
        let isQuotaHit = false;

        const worker = async () => {
            activeWorkers++;
            while (processingRef.current && runTokenRef.current === currentRunToken && !isQuotaHit) {
                const segment = await dbService.getAndMarkPendingSegment();
                
                if (!segment) {
                    break; // No more segments
                }

                // Update ref immediately for minimap sync
                const segIndex = segmentsRef.current.findIndex(s => s.id === segment.id);
                if (segIndex !== -1) {
                    segmentsRef.current[segIndex] = { ...segment, status: SegmentStatus.TRANSLATING };
                    setActiveSegmentIndex(segIndex);
                }

                try {
                    const activeGlossary = glossaryRef ? glossaryRef.current : [];
                    const matchedTerms = geminiService.matchGlossaryTermsForHtml(
                        segment.originalHtml,
                        activeGlossary
                    );

                    const translatedHtml = await geminiService.translateHtml(
                        segment.originalHtml,
                        (msg, type, data) => addAiLog(msg, type, data),
                        translationMode,
                        matchedTerms
                    );
                    
                    segment.translatedHtml = translatedHtml;
                    segment.status = SegmentStatus.TRANSLATED;
                    segment.error = undefined;
                    await dbService.updateSegment(segment);

                    if (segIndex !== -1) {
                        segmentsRef.current[segIndex] = segment;
                    }
                    
                    setProject(prev => prev ? ({ ...prev, translatedSegments: prev.translatedSegments + 1 }) : null);

                    // Phase B: Enqueue every translated segment for background term discovery via gemini-flash-lite-latest
                    enqueueLiveGlossaryDiscovery(segment.originalHtml, translatedHtml);

                } catch (e: unknown) {
                    const err = e as any;
                    const isQuota = isQuotaError(err);
                    
                    if (isQuota) {
                        if (!isQuotaHit) {
                            isQuotaHit = true;
                            discoveryQueueRef.current = [];
                            setAppState(AppState.QUOTA_PAUSED);
                            addLog("API Quota hit on all models. Pausing until quota resets.", 'WARNING');
                            playRingSound();
                        }
                        
                        segment.status = SegmentStatus.PENDING;
                        await dbService.updateSegment(segment);
                        
                        if (segIndex !== -1) {
                            segmentsRef.current[segIndex] = { ...segmentsRef.current[segIndex], status: SegmentStatus.PENDING };
                        }
                        break;
                    }

                    // Non-quota error (e.g. Tag mismatch, safety filter, etc.):
                    // Do NOT pause the entire processor! The worker continues processing the next segments.
                    segment.status = SegmentStatus.FAILED;
                    segment.error = err.message || 'Translation failed';
                    segment.retryCount = (segment.retryCount || 0) + 1;
                    
                    if (segment.retryCount >= 3) {
                        segment.status = SegmentStatus.SKIPPED;
                        addLog(`Segment ${segment.id} skipped after 3 attempts (${segment.error}). Continuing next segments.`, 'WARNING');
                    } else {
                        addLog(`Segment ${segment.id} failed attempt ${segment.retryCount}/3 (${segment.error}). Continuing next segments.`, 'WARNING');
                    }

                    await dbService.updateSegment(segment);
                    if (segIndex !== -1) {
                        segmentsRef.current[segIndex] = segment;
                    }
                } finally {
                    setSegments([...segmentsRef.current]);
                }
            }
            activeWorkers--;
            
            if (activeWorkers === 0) {
                if (!isQuotaHit && processingRef.current && runTokenRef.current === currentRunToken) {
                    const stats = await dbService.getStats();
                    if (stats.translated === stats.total && stats.total > 0) {
                        setAppState(AppState.COMPLETED);
                        addLog("Project completed!", 'SUCCESS');
                    } else {
                        setAppState(AppState.IDLE);
                    }
                }
                processingRef.current = false;
            }
        };

        // Start workers
        for (let i = 0; i < CONCURRENCY; i++) {
            worker();
        }
    }, [addLog, addAiLog, setAppState, setProject, setActiveSegmentIndex, segmentsRef, translationMode, glossaryRef, setGlossary, setIsScanningGlossary, enqueueLiveGlossaryDiscovery]);

    useEffect(() => {
        if (appState === AppState.TRANSLATING) {
            processQueue();
            const interval = setInterval(() => {
                setSegments([...segmentsRef.current]);
            }, 1000);
            return () => clearInterval(interval);
        } else {
            processingRef.current = false;
            setSegments([...segmentsRef.current]);
        }
    }, [appState, processQueue, segmentsRef, setSegments]);

    return { processingRef };
};
