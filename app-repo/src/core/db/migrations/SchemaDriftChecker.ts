import { PlannedMigration } from "./MigrationTypes";
import sqlite3 from "sqlite3";

export interface TableSchema {
  readonly name: string;
  readonly columns: readonly string[];
}

export interface SchemaSnapshot {
  readonly tables: readonly TableSchema[];
}

export interface SchemaDriftReport {
  readonly missingTables: readonly string[];
  readonly extraTables: readonly string[];
}

export class SchemaDriftChecker {
  async snapshotSqlite(dbPath: string): Promise<SchemaSnapshot> {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    try {
      const tables: TableSchema[] = [];
      const tableNames: any[] = await this.all<any>(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
      for (const row of tableNames) {
        const name = (row as any).name as string;
        const pragmaRows: any[] = await this.all<any[]>(db, `PRAGMA table_info(${name})`);
        const columns = pragmaRows.map((r) => String(r.name));
        tables.push({ name, columns });
      }
      return { tables };
    } finally {
      db.close();
    }
  }

  compare(planned: readonly PlannedMigration[], actual: SchemaSnapshot): SchemaDriftReport {
    const plannedTables = new Set<string>();
    for (const migration of planned) {
      for (const step of migration.steps) {
        if (step.kind === "create_table") {
          plannedTables.add(step.tableName);
        }
        if (step.kind === "drop_table") {
          plannedTables.delete(step.tableName);
        }
      }
    }

    const actualTables = new Set(actual.tables.map((t) => t.name));

    const missingTables: string[] = [];
    for (const name of plannedTables) {
      if (!actualTables.has(name)) {
        missingTables.push(name);
      }
    }

    const extraTables: string[] = [];
    for (const name of actualTables) {
      if (!plannedTables.has(name)) {
        extraTables.push(name);
      }
    }

    missingTables.sort();
    extraTables.sort();

    return { missingTables, extraTables };
  }

  private all<T>(db: sqlite3.Database, sql: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      db.all(sql, (err: Error | null, rows: unknown[]) => {
        if (err) return reject(err);
        resolve(rows as unknown as T[]);
      });
    });
  }
}
