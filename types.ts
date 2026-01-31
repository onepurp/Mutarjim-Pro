export enum SegmentStatus {
  PENDING = 'PENDING',
  TRANSLATING = 'TRANSLATING',
  TRANSLATED = 'TRANSLATED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  TRANSLATING = 'TRANSLATING',
  PAUSED = 'PAUSED',
  QUOTA_PAUSED = 'QUOTA_PAUSED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface Segment {
  id: string; // Composite: fileIndex-batchIndex
  fileHref: string;
  batchIndex: number;
  originalHtml: string;
  translatedHtml: string;
  status: SegmentStatus;
  retryCount: number;
  error?: string;
}

export interface ProjectData {
  id: string; // usually 'current-project' for single project app
  title: string;
  arabicTitle?: string; // User provided or auto-generated
  author: string;
  coverUrl?: string; // Blob URL
  customCoverBlob?: Blob; // User uploaded cover
  totalSegments: number;
  translatedSegments: number;
  sourceEpubBlob: Blob;
  createdAt: number;
}

export interface AnalysisResult {
  project: ProjectData;
  segments: Segment[];
}

export interface LogEntry {
  id: string;
  original: string;
  translated: string;
  timestamp: number;
}

export type LogType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface SystemLogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: LogType;
}

export interface AIDebugLogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: LogType;
  data?: any;
}

export interface LiveLogItem {
  id: string;
  orig: string;
  trans: string | null;
  status: SegmentStatus;
  timestamp: number;
  error?: string;
}