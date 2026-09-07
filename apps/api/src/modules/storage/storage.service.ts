import { Injectable } from "@nestjs/common";
import { join, resolve } from "path";
import { createReadStream, existsSync } from "fs";
import { mkdir, writeFile, unlink } from "fs/promises";
import { Readable } from "stream";
import { assertUploadPathSafe } from "../../common/utils/path-guard";

const UPLOADS_DIR = join(process.cwd(), "uploads");

@Injectable()
export class StorageService {
  async upload(key: string, body: Buffer, _contentType: string): Promise<string> {
    const filePath = resolve(join(UPLOADS_DIR, key));
    assertUploadPathSafe(filePath);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, body);
    return key;
  }

  async getReadStream(key: string): Promise<Readable> {
    const filePath = resolve(join(UPLOADS_DIR, key));
    assertUploadPathSafe(filePath);
    if (!existsSync(filePath)) throw new Error(`File not found: ${key}`);
    return createReadStream(filePath);
  }

  async getBuffer(key: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = await this.getReadStream(key);
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async exists(key: string): Promise<boolean> {
    const filePath = resolve(join(UPLOADS_DIR, key));
    assertUploadPathSafe(filePath);
    return existsSync(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = resolve(join(UPLOADS_DIR, key));
    assertUploadPathSafe(filePath);
    if (existsSync(filePath)) await unlink(filePath);
  }

  buildImportKey(orgId: string, dataSourceId: string, ext: string): string {
    return `imports/${orgId}/${dataSourceId}/${Date.now()}.${ext}`;
  }
}
