import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppState, Segment, SegmentStatus, LogType, ProjectData } from '../types';
import { dbService } from '../services/db';
import { geminiService } from '../services/geminiService';

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
        // Play a distinctive "ding-dong" alert sound
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
    addAiLog: (msg: string, type?: LogType, data?: any) => void
) => {
    const processingRef = useRef<boolean>(false);

    const processQueue = useCallback(async () => {
        if (processingRef.current) return;
        processingRef.current = true;
        addLog("Processor started.", 'INFO');

        const CONCURRENCY = 5;
        let activeWorkers = 0;
        let isQuotaHit = false;

        const worker = async () => {
            activeWorkers++;
            while (processingRef.current && !isQuotaHit) {
                const segment = await dbService.getAndMarkPendingSegment();
                
                if (!segment) {
                    break; // No more segments
                }

                // Update ref immediately for minimap sync
                const segIndex = segmentsRef.current.findIndex(s => s.id === segment.id);
                if (segIndex !== -1) {
                    segmentsRef.current[segIndex] = { ...segment, status: SegmentStatus.TRANSLATING };
                    setActiveSegmentIndex(segIndex); // Focus on one of the active ones
                }

                try {
                    const translatedHtml = await geminiService.translateHtml(segment.originalHtml, (msg, type, data) => addAiLog(msg, type, data));
                    
                    segment.translatedHtml = translatedHtml;
                    segment.status = SegmentStatus.TRANSLATED;
                    segment.error = undefined;
                    await dbService.updateSegment(segment);

                    if (segIndex !== -1) {
                        segmentsRef.current[segIndex] = segment;
                    }
                    
                    setProject(prev => prev ? ({ ...prev, translatedSegments: prev.translatedSegments + 1 }) : null);

                } catch (e: unknown) {
                    const err = e as any;
                    const isQuota = err.message?.includes('429') || err.status === 429;
                    
                    if (isQuota) {
                        if (!isQuotaHit) {
                            isQuotaHit = true;
                            setAppState(AppState.QUOTA_PAUSED);
                            addLog("API Quota hit. Pausing.", 'WARNING');
                            playRingSound();
                        }
                        
                        segment.status = SegmentStatus.PENDING;
                        await dbService.updateSegment(segment);
                        
                        if (segIndex !== -1) {
                            segmentsRef.current[segIndex] = { ...segmentsRef.current[segIndex], status: SegmentStatus.PENDING };
                        }
                        break;
                    }

                    segment.status = SegmentStatus.FAILED;
                    segment.error = err.message;
                    segment.retryCount = (segment.retryCount || 0) + 1;
                    
                    if (segment.retryCount >= 3) {
                        segment.status = SegmentStatus.SKIPPED;
                        addLog(`Segment ${segment.id} skipped (max retries).`, 'WARNING');
                    }

                    await dbService.updateSegment(segment);
                    if (segIndex !== -1) {
                        segmentsRef.current[segIndex] = segment;
                    }
                }
            }
            activeWorkers--;
            
            if (activeWorkers === 0) {
                processingRef.current = false;
                if (!isQuotaHit) {
                    const stats = await dbService.getStats();
                    if (stats.translated === stats.total && stats.total > 0) {
                        setAppState(AppState.COMPLETED);
                        addLog("Project completed!", 'SUCCESS');
                    } else {
                        setAppState(AppState.IDLE);
                    }
                }
            }
        };

        // Start workers
        for (let i = 0; i < CONCURRENCY; i++) {
            worker();
        }
    }, [addLog, addAiLog, setAppState, setProject, setActiveSegmentIndex, segmentsRef]);

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
