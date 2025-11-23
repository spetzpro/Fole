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
      return `CREATE TABLE${ine} ${tableName} (id TEXT PRIMARY KEY);`;
    }
    // postgres
    return `CREATE TABLE${ine} ${tableName} (id uuid PRIMARY KEY);`;
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
