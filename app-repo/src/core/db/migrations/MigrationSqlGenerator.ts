import { MigrationEngine, MigrationStep, PlannedMigration } from "./MigrationTypes";

export interface GeneratedSql {
  readonly engine: MigrationEngine;
  readonly statements: readonly string[];
}

export class MigrationSqlGenerator {
  private readonly engine: MigrationEngine;

  constructor(engine: MigrationEngine) {
    this.engine = engine === "any" ? "sqlite" : engine;
  }

  generate(plan: readonly PlannedMigration[]): GeneratedSql {
    const statements: string[] = [];
    for (const migration of plan) {
      for (const step of migration.steps) {
        statements.push(...this.generateForStep(step));
      }
    }
    return { engine: this.engine, statements };
  }

  private generateForStep(step: MigrationStep): string[] {
    switch (step.kind) {
      case "create_table":
        return [this.createTableSql(step.tableName, !!step.ifNotExists)];
      case "drop_table":
        return [this.dropTableSql(step.tableName, !!step.ifExists)];
      case "add_column":
        return [this.addColumnSql(step.tableName, step.columnName)];
      case "drop_column":
        return [this.dropColumnSql(step.tableName, step.columnName)];
      default: {
        const _exhaustive: never = step;
        return _exhaustive;
      }
    }
  }

  private createTableSql(tableName: string, ifNotExists: boolean): string {
    const ine = ifNotExists ? " IF NOT EXISTS" : "";
    if (this.engine === "sqlite") {
      switch (tableName) {
        case "files":
          return `CREATE TABLE${ine} files (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL);`;
        case "comments":
          return `CREATE TABLE${ine} comments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, anchor_type TEXT NOT NULL, anchor_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL);`;
        default:
          return `CREATE TABLE${ine} ${tableName} (id TEXT PRIMARY KEY);`;
      }
    }
    // postgres
    switch (tableName) {
      case "files":
        return `CREATE TABLE${ine} files (id uuid PRIMARY KEY, project_id text NOT NULL, original_name text NOT NULL, mime_type text NOT NULL, size integer NOT NULL, created_at text NOT NULL, created_by text NOT NULL);`;
      case "comments":
        return `CREATE TABLE${ine} comments (id uuid PRIMARY KEY, project_id text NOT NULL, anchor_type text NOT NULL, anchor_id text NOT NULL, body text NOT NULL, created_at text NOT NULL, created_by text NOT NULL);`;
      default:
        return `CREATE TABLE${ine} ${tableName} (id uuid PRIMARY KEY);`;
    }
  }

  private dropTableSql(tableName: string, ifExists: boolean): string {
    const ie = ifExists ? " IF EXISTS" : "";
    return `DROP TABLE${ie} ${tableName};`;
  }

  private addColumnSql(tableName: string, columnName: string): string {
    if (this.engine === "sqlite") {
      return `ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT;`;
    }
    return `ALTER TABLE ${tableName} ADD COLUMN ${columnName} text;`;
  }

  private dropColumnSql(tableName: string, columnName: string): string {
    return `ALTER TABLE ${tableName} DROP COLUMN ${columnName};`;
  }
}
