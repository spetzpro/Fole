import { promises as fs } from "fs";
import type { Result } from "../../foundation/CoreTypes";

export interface FileStorage {
  readFile(path: string): Promise<Result<Buffer>>;
  readText(path: string, encoding?: string): Promise<Result<string>>;
  writeFileAtomic(path: string, data: Buffer): Promise<Result<void>>;
  writeTextAtomic(path: string, text: string, encoding?: string): Promise<Result<void>>;
  deleteFile(path: string): Promise<Result<void>>;
}

let globalFileStorage: FileStorage | undefined;

export function getFileStorage(): FileStorage {
  if (!globalFileStorage) {
    globalFileStorage = createDefaultFileStorage();
  }
  return globalFileStorage;
}

export function setFileStorage(storage: FileStorage): void {
  globalFileStorage = storage;
}

export function createDefaultFileStorage(): FileStorage {
  return {
    async readFile(path: string): Promise<Result<Buffer>> {
      try {
        const data = await fs.readFile(path);
        return { ok: true, value: data };
      } catch (error) {
        return {
          ok: false,
          error: { code: "FILE_READ_FAILED", message: "Failed to read file", details: error },
        };
      }
    },

    async readText(path: string, encoding: BufferEncoding = "utf8"): Promise<Result<string>> {
      try {
        const data = await fs.readFile(path, { encoding });
        return { ok: true, value: data };
      } catch (error) {
        return {
          ok: false,
          error: { code: "FILE_READ_FAILED", message: "Failed to read text file", details: error },
        };
      }
    },

    async writeFileAtomic(path: string, data: Buffer): Promise<Result<void>> {
      try {
        // For now this is a simple write; it can later be upgraded to use
        // the atomic write pipeline defined in the storage architecture.
        await fs.writeFile(path, data);
        return { ok: true, value: undefined };
      } catch (error) {
        return {
          ok: false,
          error: { code: "FILE_WRITE_FAILED", message: "Failed to write file", details: error },
        };
      }
    },

    async writeTextAtomic(path: string, text: string, encoding: BufferEncoding = "utf8"): Promise<Result<void>> {
      try {
        await fs.writeFile(path, text, { encoding });
        return { ok: true, value: undefined };
      } catch (error) {
        return {
          ok: false,
          error: { code: "FILE_WRITE_FAILED", message: "Failed to write text file", details: error },
        };
      }
    },

    async deleteFile(path: string): Promise<Result<void>> {
      try {
        await fs.unlink(path);
        return { ok: true, value: undefined };
      } catch (error: any) {
        if (error && error.code === "ENOENT") {
          // Deleting a non-existent file is treated as success.
          return { ok: true, value: undefined };
        }
        return {
          ok: false,
          error: { code: "FILE_DELETE_FAILED", message: "Failed to delete file", details: error },
        };
      }
    },
  };
}
