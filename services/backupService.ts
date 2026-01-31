import JSZip from 'jszip';
import { dbService } from './db';
import { ProjectData, Segment, SegmentStatus } from '../types';

const BACKUP_VERSION = 1;

export const backupService = {
  async createBackup(): Promise<Blob> {
    const project = await dbService.getProject();
    
    if (!project) throw new Error("No active project to backup");
    
    // Critical Integrity Check: Ensure source EPUB exists
    if (!(project.sourceEpubBlob instanceof Blob)) {
        console.error("Source EPUB Blob is missing or invalid:", project.sourceEpubBlob);
        throw new Error("Critical Data Error: The source EPUB file is missing from the database. A valid backup cannot be created.");
    }

    const segments = await dbService.getAllSegments();
    if (!segments) {
        throw new Error("Failed to retrieve translation segments.");
    }

    const zip = new JSZip();
    
    // 1. Add Source EPUB (Essential)
    // We explicitly set the name to ensure consistency on restore
    zip.file("source.epub", project.sourceEpubBlob);

    // 2. Add Custom Cover (Optional)
    if (project.customCoverBlob instanceof Blob) {
        zip.file("custom-cover.bin", project.customCoverBlob);
    }
    
    // 3. Add Metadata
    // We wrap project data to allow for future metadata fields (version, timestamp)
    const meta = {
        version: BACKUP_VERSION,
        timestamp: Date.now(),
        projectData: {
            ...project,
            // Exclude blobs from JSON to avoid massive files / serialization errors
            sourceEpubBlob: null, 
            customCoverBlob: null, 
            coverUrl: undefined 
        }
    };
    zip.file("project.json", JSON.stringify(meta, null, 2));
    
    // 4. Add Segments
    zip.file("segments.json", JSON.stringify(segments));

    // Generate with compression to save space, though EPUBs are already compressed.
    // We compress the JSONs effectively.
    return await zip.generateAsync({ 
        type: 'blob', 
        mimeType: 'application/octet-stream',
        compression: "DEFLATE",
        compressionOptions: { level: 6 } 
    });
  },

  async restoreBackup(file: File): Promise<void> {
    let zip: JSZip;
    try {
        zip = await new JSZip().loadAsync(file);
    } catch (e) {
        throw new Error("Invalid file format. Please ensure you are uploading a valid .mtj backup file.");
    }
    
    // Check for essential files
    const sourceBlob = await zip.file("source.epub")?.async('blob');
    const projectJsonStr = await zip.file("project.json")?.async('string');
    const segmentsJsonStr = await zip.file("segments.json")?.async('string');
    const customCoverBlob = await zip.file("custom-cover.bin")?.async('blob');

    if (!projectJsonStr) throw new Error("Invalid Backup: Missing project metadata (project.json).");
    if (!segmentsJsonStr) throw new Error("Invalid Backup: Missing translation segments (segments.json).");
    if (!sourceBlob) throw new Error("Invalid Backup: Missing source EPUB file (source.epub).");

    let meta: any;
    let segments: Segment[];

    try {
        meta = JSON.parse(projectJsonStr);
        segments = JSON.parse(segmentsJsonStr);
    } catch (e) {
        throw new Error("Corrupted backup data: Unable to parse JSON metadata.");
    }

    // Handle Metadata Structure (Backward Compatibility)
    // If 'projectData' key doesn't exist, assume the root object is the project (legacy backups)
    let projectData = meta.projectData;
    if (!projectData && meta.id) {
        projectData = meta;
    }

    if (!projectData) throw new Error("Invalid Backup: Malformed project metadata.");

    // Recalculate Statistics for Consistency
    // This ensures that if the 'translatedSegments' count in metadata was out of sync, it gets fixed on restore.
    const actualTranslatedCount = segments.filter(s => s.status === SegmentStatus.TRANSLATED).length;

    // Reconstruct Project Object
    const project: ProjectData = {
        ...projectData,
        // Crucial: Re-attach the source blob with correct MIME type for epubService
        sourceEpubBlob: new Blob([sourceBlob], { type: 'application/epub+zip' }),
        // Re-attach custom cover if it exists
        customCoverBlob: customCoverBlob ? new Blob([customCoverBlob], { type: 'image/jpeg' }) : undefined,
        coverUrl: customCoverBlob ? URL.createObjectURL(customCoverBlob) : undefined,
        
        // Enforce consistent stats
        totalSegments: segments.length,
        translatedSegments: actualTranslatedCount,
    };

    // Perform Database Restoration
    await dbService.clearDatabase();
    await dbService.saveProject(project);
    await dbService.addSegments(segments);
  }
};