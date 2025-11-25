# Module: core.storage.FileStorage

## 1. Purpose
Generic async file IO with atomic write support.

## 2. Responsibilities
- readFile, writeFileAtomic, deleteFile
- All operations return Result

## 3. Public API
~~~ts
export interface FileStorage {
  readFile(path: string): Promise<Result<Buffer>>;
  readText(path: string, encoding?: string): Promise<Result<string>>;
  writeFileAtomic(path: string, data: Buffer): Promise<Result<void>>;
  writeTextAtomic(path: string, text: string, encoding?: string): Promise<Result<void>>;
  deleteFile(path: string): Promise<Result<void>>;
}

export function getFileStorage(): FileStorage;
~~~
