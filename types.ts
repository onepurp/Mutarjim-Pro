
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

export interface ExportSettings {
  textAlignment: 'right' | 'center' | 'left' | 'justify';
  forceAlignment: boolean; // If true, uses !important to override original styles
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
  schemaVersion?: number; // 1 = legacy (elements only), 2 = v2 (nodes)
  exportSettings?: ExportSettings;
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
  error?: string;
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

// EPUB Architect Types
export interface EpubMetadata {
  title: string;
  creator: string;
  language: string;
  identifier: string;
  publisher?: string;
  description?: string;
}

export interface StructuralIssue {
  id: string;
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  category: 'METADATA' | 'STRUCTURE' | 'CSS' | 'COMPATIBILITY' | 'TOC';
  description: string;
  recommendation: string;
  autoFixable: boolean;
}

export interface FontRecommendation {
  role: 'body' | 'heading' | 'subheading' | 'quote' | 'code';
  fontFamily: string;
  kebabName: string;
  category: 'serif' | 'sans-serif' | 'display' | 'monospace' | 'handwriting';
  subset: string;
  justification: string;
}

export interface TypographyProfile {
  themeName: string;
  lineHeight: string;
  paragraphSpacing: string;
  headingTopMargin: string;
  headingBottomMargin: string;
  maxWidth: string;
  baseFontSize: string;
}

export interface ArchitectAnalysisResult {
  metadata: EpubMetadata;
  issues: StructuralIssue[];
  manifestCount: number;
  cssFileCount: number;
  originalSize: number;
  detectedLanguage: string;
  isRTL: boolean;
  bookPersonality: string;
  tocStatus: {
    exists: boolean;
    path: string;
    brokenLinks: number;
    type: 'NCX' | 'NAV' | 'NONE';
  };
  fontRecommendations: FontRecommendation[];
  typographyProfile: TypographyProfile;
}

export interface RepairActions {
  fixMetadata: boolean;
  standardizeCSS: boolean;
  fixStructure: boolean;
  addMissingTags: boolean;
  fixTOC: boolean;
  embedFonts: boolean;
}

export interface ProcessingLog {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error';
}