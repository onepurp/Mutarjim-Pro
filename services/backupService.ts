import JSZip from 'jszip';
import { dbService } from './db';
import { ProjectData, Segment, SegmentStatus, GlossaryTerm } from '../types';

const BACKUP_VERSION = 2;

export const backupService = {
  async createBackup(): Promise<Blob> {
    const project = await dbService.getProject();

    if (!project) throw new Error("No active project to backup");

    if (!(project.sourceEpubBlob instanceof Blob)) {
      console.error("Source EPUB Blob is missing or invalid:", project.sourceEpubBlob);
      throw new Error("Critical Data Error: The source EPUB file is missing from the database. A valid backup cannot be created.");
    }

    const segments = await dbService.getAllSegments();
    if (!segments) {
      throw new Error("Failed to retrieve translation segments.");
    }

    const glossary = await dbService.getGlossary();

    const zip = new JSZip();

    // 1. Add Source EPUB (Essential)
    zip.file("source.epub", project.sourceEpubBlob);

    // 2. Add Custom Cover (Optional)
    if (project.customCoverBlob instanceof Blob) {
      zip.file("custom-cover.bin", project.customCoverBlob);
    }

    // 3. Add Metadata
    const meta = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      projectData: {
        ...project,
        sourceEpubBlob: null,
        customCoverBlob: null,
        coverUrl: undefined,
      },
    };
    zip.file("project.json", JSON.stringify(meta, null, 2));

    // 4. Add Segments
    zip.file("segments.json", JSON.stringify(segments));

    // 5. Add Glossary
    zip.file("glossary.json", JSON.stringify(glossary || []));

    return await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/octet-stream',
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  },

  async restoreBackup(file: File): Promise<void> {
    let zip: JSZip;
    try {
      zip = await new JSZip().loadAsync(file);
    } catch (e) {
      throw new Error("Invalid file format. Please ensure you are uploading a valid .mtj backup file.");
    }

    const sourceBlob = await zip.file("source.epub")?.async('blob');
    const projectJsonStr = await zip.file("project.json")?.async('string');
    const segmentsJsonStr = await zip.file("segments.json")?.async('string');
    const glossaryJsonStr = await zip.file("glossary.json")?.async('string');
    const customCoverBlob = await zip.file("custom-cover.bin")?.async('blob');

    if (!projectJsonStr) throw new Error("Invalid Backup: Missing project metadata (project.json).");
    if (!segmentsJsonStr) throw new Error("Invalid Backup: Missing translation segments (segments.json).");
    if (!sourceBlob) throw new Error("Invalid Backup: Missing source EPUB file (source.epub).");

    let meta: any;
    let segments: Segment[];
    let glossary: GlossaryTerm[] = [];

    try {
      meta = JSON.parse(projectJsonStr);
      segments = JSON.parse(segmentsJsonStr);
      if (glossaryJsonStr) {
        glossary = JSON.parse(glossaryJsonStr);
      }
    } catch (e) {
      throw new Error("Corrupted backup data: Unable to parse JSON metadata.");
    }

    let projectData = meta.projectData;
    if (!projectData && meta.id) {
      projectData = meta;
    }

    if (!projectData) throw new Error("Invalid Backup: Malformed project metadata.");

    const actualTranslatedCount = segments.filter(s => s.status === SegmentStatus.TRANSLATED).length;

    const project: ProjectData = {
      ...projectData,
      sourceEpubBlob: new Blob([sourceBlob], { type: 'application/epub+zip' }),
      customCoverBlob: customCoverBlob ? new Blob([customCoverBlob], { type: 'image/jpeg' }) : undefined,
      coverUrl: customCoverBlob ? URL.createObjectURL(customCoverBlob) : undefined,
      totalSegments: segments.length,
      translatedSegments: actualTranslatedCount,
      glossaryInitialized: projectData.glossaryInitialized ?? glossary.length > 0,
    };

    await dbService.clearDatabase();
    await dbService.saveProject(project);
    await dbService.addSegments(segments);
    if (glossary.length > 0) {
      await dbService.saveGlossaryTerms(glossary, true);
    }
  },
};