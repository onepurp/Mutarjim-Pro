import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ProjectData, Segment, SegmentStatus, GlossaryTerm } from '../types';

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
  glossary: {
    key: string;
    value: GlossaryTerm;
  };
}

const DB_NAME = 'mutarjim-pro-db';
const PROJECT_KEY = 'current-project';

let dbPromise: Promise<IDBPDatabase<MutarjimDB>> | null = null;

const ensureSchema = (db: IDBPDatabase<MutarjimDB>, transaction: any) => {
  if (!db.objectStoreNames.contains('project')) {
    db.createObjectStore('project');
  }
  const segmentStore = !db.objectStoreNames.contains('segments')
    ? db.createObjectStore('segments', { keyPath: 'id' })
    : transaction.objectStore('segments');

  if (!segmentStore.indexNames.contains('by-status')) {
    segmentStore.createIndex('by-status', 'status');
  }

  if (db.objectStoreNames.contains('glossary')) {
    const existingGlossaryStore = transaction.objectStore('glossary');
    if (existingGlossaryStore.keyPath !== 'id') {
      db.deleteObjectStore('glossary');
      db.createObjectStore('glossary', { keyPath: 'id' });
    }
  } else {
    db.createObjectStore('glossary', { keyPath: 'id' });
  }
};

const initDB = async (): Promise<IDBPDatabase<MutarjimDB>> => {
  try {
    return await openDB<MutarjimDB>(DB_NAME, 5, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        ensureSchema(db, transaction);
      },
    });
  } catch (err: any) {
    if (err?.name === 'VersionError' || err?.message?.includes('higher version')) {
      const existingDb = await openDB<MutarjimDB>(DB_NAME);
      let glossaryValid = false;
      if (existingDb.objectStoreNames.contains('glossary')) {
        try {
          const tx = existingDb.transaction('glossary', 'readonly');
          glossaryValid = tx.store.keyPath === 'id';
        } catch {
          glossaryValid = false;
        }
      }
      if (
        existingDb.objectStoreNames.contains('project') &&
        existingDb.objectStoreNames.contains('segments') &&
        glossaryValid
      ) {
        return existingDb;
      }
      const nextVersion = existingDb.version + 1;
      existingDb.close();
      return await openDB<MutarjimDB>(DB_NAME, nextVersion, {
        upgrade(db, _oldVersion, _newVersion, transaction) {
          ensureSchema(db, transaction);
        },
      });
    }
    throw err;
  }
};

const getDB = () => {
  if (!dbPromise) {
    dbPromise = initDB().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
};

export const normalizeGlossaryKey = (source: string): string => {
  if (!source || typeof source !== 'string') return '';
  return source
    .trim()
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/\s+/g, ' ');
};

const coerceGlossaryTerm = (raw: any): GlossaryTerm | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = typeof raw.source === 'string'
    ? raw.source.trim()
    : typeof raw.term === 'string'
    ? raw.term.trim()
    : typeof raw.original === 'string'
    ? raw.original.trim()
    : '';
  const target = typeof raw.target === 'string'
    ? raw.target.trim()
    : typeof raw.translation === 'string'
    ? raw.translation.trim()
    : typeof raw.translated === 'string'
    ? raw.translated.trim()
    : '';

  if (!source || !target) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : normalizeGlossaryKey(source);
  if (!id) return null;

  const validCategories = ['character', 'location', 'title', 'concept'];
  const category = validCategories.includes(raw.category) ? raw.category : 'concept';

  return {
    id,
    source,
    target,
    category,
    notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : undefined,
    sourceType: raw.sourceType === 'manual' || raw.sourceType === 'auto-live' ? raw.sourceType : 'auto-scan',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
};

export const replaceTextInHtmlNodes = (
  html: string,
  oldText: string,
  newText: string
): { updatedHtml: string; count: number } => {
  if (!html || !oldText || oldText === newText) {
    return { updatedHtml: html, count: 0 };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__mutarjim_root__">${html}</div>`, 'text/html');
  const root = doc.getElementById('__mutarjim_root__');
  if (!root) {
    return { updatedHtml: html, count: 0 };
  }

  let totalReplacements = 0;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    const val = currentNode.nodeValue;
    if (val && val.includes(oldText)) {
      const parts = val.split(oldText);
      const occurrences = parts.length - 1;
      if (occurrences > 0) {
        totalReplacements += occurrences;
        currentNode.nodeValue = parts.join(newText);
      }
    }
    currentNode = walker.nextNode();
  }

  if (totalReplacements === 0) {
    return { updatedHtml: html, count: 0 };
  }

  return { updatedHtml: root.innerHTML, count: totalReplacements };
};

export const countTextInHtmlNodes = (html: string, searchText: string): number => {
  if (!html || !searchText) return 0;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__mutarjim_root__">${html}</div>`, 'text/html');
  const root = doc.getElementById('__mutarjim_root__');
  if (!root) return 0;

  let count = 0;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode) {
    const val = currentNode.nodeValue;
    if (val && val.includes(searchText)) {
      count += val.split(searchText).length - 1;
    }
    currentNode = walker.nextNode();
  }
  return count;
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
    for (const s of segments) {
      tx.store.put(s);
    }
    await tx.done;
  },

  async getAndMarkPendingSegment(): Promise<Segment | undefined> {
    const db = await getDB();
    const tx = db.transaction('segments', 'readwrite');
    const index = tx.store.index('by-status');

    let segment = await index.get(SegmentStatus.PENDING);

    if (!segment) {
      segment = await index.get(SegmentStatus.FAILED);
    }

    if (segment) {
      segment.status = SegmentStatus.TRANSLATING;
      await tx.store.put(segment);
    }

    await tx.done;
    return segment;
  },

  async getPendingSegment(): Promise<Segment | undefined> {
    const db = await getDB();

    let segment = await db.getFromIndex('segments', 'by-status', SegmentStatus.PENDING);

    if (!segment) {
      segment = await db.getFromIndex('segments', 'by-status', SegmentStatus.FAILED);
    }

    return segment;
  },

  async updateSegment(segment: Segment): Promise<void> {
    const db = await getDB();
    await db.put('segments', segment);

    if (segment.status === SegmentStatus.TRANSLATED) {
      const project = await this.getProject();
      if (project) {
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

  async getGlossary(): Promise<GlossaryTerm[]> {
    const db = await getDB();
    if (!db.objectStoreNames.contains('glossary')) return [];
    const rawTerms = await db.getAll('glossary');
    const validTerms: GlossaryTerm[] = [];
    for (const raw of rawTerms) {
      const coerced = coerceGlossaryTerm(raw);
      if (coerced) {
        validTerms.push(coerced);
      }
    }
    return validTerms.sort((a, b) => (a.source || '').localeCompare(b.source || ''));
  },

  async upsertGlossaryTerm(term: GlossaryTerm): Promise<void> {
    const db = await getDB();
    const coerced = coerceGlossaryTerm(term);
    if (!coerced) return;
    await db.put('glossary', coerced);
  },

  async saveGlossaryTerms(
    incomingTerms: GlossaryTerm[],
    overwriteExisting: boolean = false
  ): Promise<GlossaryTerm[]> {
    const db = await getDB();
    const tx = db.transaction('glossary', 'readwrite');

    for (const rawTerm of incomingTerms) {
      const coerced = coerceGlossaryTerm(rawTerm);
      if (!coerced) continue;

      const existing = await tx.store.get(coerced.id);
      if (existing && !overwriteExisting) {
        continue;
      }

      await tx.store.put({
        ...coerced,
        createdAt: existing?.createdAt || coerced.createdAt || Date.now(),
      });
    }

    await tx.done;
    return this.getGlossary();
  },

  async deleteGlossaryTerm(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('glossary', id);
  },

  async clearGlossary(): Promise<void> {
    const db = await getDB();
    await db.clear('glossary');
  },

  async replaceTermInSegments(
    oldArabic: string,
    newArabic: string
  ): Promise<{ updatedSegmentsCount: number; replacementsCount: number; segments: Segment[] }> {
    const db = await getDB();
    const allSegments = await db.getAll('segments');
    let updatedSegmentsCount = 0;
    let replacementsCount = 0;

    const tx = db.transaction('segments', 'readwrite');
    for (const seg of allSegments) {
      if (seg.translatedHtml && seg.translatedHtml.includes(oldArabic)) {
        const { updatedHtml, count } = replaceTextInHtmlNodes(
          seg.translatedHtml,
          oldArabic,
          newArabic
        );
        if (count > 0) {
          seg.translatedHtml = updatedHtml;
          updatedSegmentsCount += 1;
          replacementsCount += count;
          await tx.store.put(seg);
        }
      }
    }
    await tx.done;

    return {
      updatedSegmentsCount,
      replacementsCount,
      segments: allSegments,
    };
  },

  async clearDatabase(): Promise<void> {
    const db = await getDB();
    await db.clear('project');
    await db.clear('segments');
    if (db.objectStoreNames.contains('glossary')) {
      await db.clear('glossary');
    }
  },

  async getStats(): Promise<{ total: number; translated: number; failed: number }> {
    const db = await getDB();
    const total = await db.count('segments');
    const translated = await db.countFromIndex('segments', 'by-status', SegmentStatus.TRANSLATED);
    const failed = await db.countFromIndex('segments', 'by-status', SegmentStatus.FAILED);
    return { total, translated, failed };
  },

  async resetTranslatingSegments(): Promise<number> {
    const db = await getDB();
    const tx = db.transaction('segments', 'readwrite');
    const index = tx.store.index('by-status');

    const translatingSegments = await index.getAll(SegmentStatus.TRANSLATING);

    for (const segment of translatingSegments) {
      segment.status = SegmentStatus.PENDING;
      await tx.store.put(segment);
    }

    await tx.done;
    return translatingSegments.length;
  },

  async retrySkippedSegments(): Promise<number> {
    const db = await getDB();
    const tx = db.transaction('segments', 'readwrite');
    const index = tx.store.index('by-status');

    const skippedSegments = await index.getAll(SegmentStatus.SKIPPED);

    for (const segment of skippedSegments) {
      segment.status = SegmentStatus.PENDING;
      segment.retryCount = 0;
      segment.error = undefined;
      await tx.store.put(segment);
    }

    await tx.done;
    return skippedSegments.length;
  },
};