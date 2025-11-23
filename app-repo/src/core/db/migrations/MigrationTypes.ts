export type MigrationId = string;

export type MigrationEngine = "sqlite" | "postgres" | "any";

export interface CreateTableStep {
  readonly kind: "create_table";
  readonly tableName: string;
  readonly ifNotExists?: boolean;
}

export interface DropTableStep {
  readonly kind: "drop_table";
  readonly tableName: string;
  readonly ifExists?: boolean;
}

export interface AddColumnStep {
  readonly kind: "add_column";
  readonly tableName: string;
  readonly columnName: string;
}

export interface DropColumnStep {
  readonly kind: "drop_column";
  readonly tableName: string;
  readonly columnName: string;
}

export type MigrationStep = CreateTableStep | DropTableStep | AddColumnStep | DropColumnStep;

export type MigrationSafety = "non_destructive" | "destructive";

export interface MigrationDefinition {
  readonly id: MigrationId;
  readonly title: string;
  readonly engine: MigrationEngine;
  readonly safety: MigrationSafety;
  readonly up: readonly MigrationStep[];
  readonly down: readonly MigrationStep[];
}

export interface PlannedMigration {
  readonly id: MigrationId;
  readonly title: string;
  readonly steps: readonly MigrationStep[];
}
