import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

export interface StorageProvider {
  saveFile(agentId: string, dataSourceId: string, filename: string, buffer: Buffer): Promise<string>;
  deleteFile(fileRef: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  async saveFile(agentId: string, dataSourceId: string, filename: string, buffer: Buffer): Promise<string> {
    const dir = path.join(UPLOADS_DIR, agentId, dataSourceId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath; // Use the file path as the reference link
  }

  async deleteFile(fileRef: string): Promise<void> {
    try {
      if (fs.existsSync(fileRef)) {
        fs.unlinkSync(fileRef);
      }
    } catch (err) {
      console.error(`Failed to delete local file: ${fileRef}`, err);
    }
  }
}

export const storage = new LocalStorageProvider();
