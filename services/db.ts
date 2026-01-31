import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ProjectData, Segment, SegmentStatus } from '../types';

interface MutarjimDB extends DBSchema {
  project: {
    key: string;
    value: ProjectData;
  };
  segments: {
    key: string;
    value: Segment;
    indexes: { 'by-status': string };
  };
}

const DB_NAME = 'mutarjim-pro-db';
const PROJECT_KEY = 'current-project';

let dbPromise: Promise<IDBPDatabase<MutarjimDB>>;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<MutarjimDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('project');
        const segmentStore = db.createObjectStore('segments', { keyPath: 'id' });
        segmentStore.createIndex('by-status', 'status');
      },
    });
  }
  return dbPromise;
};

export const dbService = {
  async saveProject(project: ProjectData): Promise<void> {
    const db = await getDB();
    await db.put('project', { ...project, id: PROJECT_KEY }, PROJECT_KEY);
  },

  async getProject(): Promise<ProjectData | undefined> {
    const db = await getDB();
    return db.get('project', PROJECT_KEY);
  },

  async addSegments(segments: Segment[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('segments', 'readwrite');
    // Using a loop to queue up requests is more memory efficient than creating 
    // an array of promises for Promise.all when handling large datasets.
    for (const s of segments) {
      tx.store.put(s);
    }
    await tx.done;
  },

  async getPendingSegment(): Promise<Segment | undefined> {
    const db = await getDB();
    
    // 1. Prioritize PENDING segments so progress is visible immediately
    let segment = await db.getFromIndex('segments', 'by-status', SegmentStatus.PENDING);
    
    // 2. If no PENDING, look for FAILED segments to retry
    if (!segment) {
      segment = await db.getFromIndex('segments', 'by-status', SegmentStatus.FAILED);
    }
    
    return segment;
  },

  async updateSegment(segment: Segment): Promise<void> {
    const db = await getDB();
    await db.put('segments', segment);
    
    // Update project progress
    if (segment.status === SegmentStatus.TRANSLATED) {
      const project = await this.getProject();
      if (project) {
        // Optimistic update to avoid costly count operations on every segment if possible,
        // but for now, we do a count to be accurate.
        // NOTE: If performance becomes an issue, we should increment the project value directly.
        const count = await db.countFromIndex('segments', 'by-status', SegmentStatus.TRANSLATED);
        project.translatedSegments = count;
        await db.put('project', project, PROJECT_KEY);
      }
    }
  },

  async getAllSegments(): Promise<Segment[]> {
    const db = await getDB();
    return db.getAll('segments');
  },

  async clearDatabase(): Promise<void> {
    const db = await getDB();
    await db.clear('project');
    await db.clear('segments');
  },

  async getStats(): Promise<{ total: number; translated: number; failed: number }> {
    const db = await getDB();
    const total = await db.count('segments');
    const translated = await db.countFromIndex('segments', 'by-status', SegmentStatus.TRANSLATED);
    const failed = await db.countFromIndex('segments', 'by-status', SegmentStatus.FAILED);
    return { total, translated, failed };
  },

  async retrySkippedSegments(): Promise<number> {
    const db = await getDB();
    const tx = db.transaction('segments', 'readwrite');
    const index = tx.store.index('by-status');
    
    // Get all skipped segments first
    const skippedSegments = await index.getAll(SegmentStatus.SKIPPED);
    
    for (const segment of skippedSegments) {
        segment.status = SegmentStatus.PENDING;
        segment.retryCount = 0;
        segment.error = undefined;
        await tx.store.put(segment);
    }
    
    await tx.done;
    return skippedSegments.length;
  }
};