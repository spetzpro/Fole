import type { MigrationDefinition } from "./MigrationTypes";

export const CORE_INITIAL_MIGRATIONS: readonly MigrationDefinition[] = [
  {
    id: "20251123-001-create-users",
    title: "Create users table (core)",
    engine: "any",
    safety: "non_destructive",
    up: [
      { kind: "create_table", tableName: "users", ifNotExists: true },
    ],
    down: [
      { kind: "drop_table", tableName: "users", ifExists: true },
    ],
  },
  {
    id: "20251123-002-create-projects",
    title: "Create projects table (core)",
    engine: "any",
    safety: "non_destructive",
    up: [
      { kind: "create_table", tableName: "projects", ifNotExists: true },
    ],
    down: [
      { kind: "drop_table", tableName: "projects", ifExists: true },
    ],
  },
];

export const PROJECT_DB_INITIAL_MIGRATIONS: readonly MigrationDefinition[] = [
  {
    id: "20251123-101-create-maps",
    title: "Create maps table (project DB)",
    engine: "any",
    safety: "non_destructive",
    up: [
      { kind: "create_table", tableName: "maps", ifNotExists: true },
    ],
    down: [
      { kind: "drop_table", tableName: "maps", ifExists: true },
    ],
  },
];
