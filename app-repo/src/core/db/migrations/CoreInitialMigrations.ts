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
  {
    id: "20251202-003-bootstrap-users-identity-fields",
    title: "Add identity fields to users table (core)",
    engine: "any",
    safety: "non_destructive",
    up: [
      { kind: "add_column", tableName: "users", columnName: "email" },
      { kind: "add_column", tableName: "users", columnName: "user_external_id" },
      { kind: "add_column", tableName: "users", columnName: "created_at" },
    ],
    down: [
      { kind: "drop_column", tableName: "users", columnName: "email" },
      { kind: "drop_column", tableName: "users", columnName: "user_external_id" },
      { kind: "drop_column", tableName: "users", columnName: "created_at" },
    ],
  },
  {
    id: "20251203-004-create-invites",
    title: "Create invites table (core)",
    engine: "any",
    safety: "non_destructive",
    up: [
      { kind: "create_table", tableName: "invites", ifNotExists: true },
    ],
    down: [
      { kind: "drop_table", tableName: "invites", ifExists: true },
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
  {
    id: "20251201-201-create-map-calibrations",
    title: "Create map_calibrations table (project DB)",
    engine: "any",
    safety: "non_destructive",
    up: [
      { kind: "create_table", tableName: "map_calibrations", ifNotExists: true },
    ],
    down: [
      { kind: "drop_table", tableName: "map_calibrations", ifExists: true },
    ],
  },
  {
    id: "20251201-301-create-project-members",
    title: "Create project_members table (project DB)",
    engine: "any",
    safety: "non_destructive",
    up: [
      { kind: "create_table", tableName: "project_members", ifNotExists: true },
    ],
    down: [
      { kind: "drop_table", tableName: "project_members", ifExists: true },
    ],
  },
  {
    id: "20251202-401-create-files",
    title: "Create files table (project DB)",
    engine: "any",
    safety: "non_destructive",
    up: [
      { kind: "create_table", tableName: "files", ifNotExists: true },
    ],
    down: [
      { kind: "drop_table", tableName: "files", ifExists: true },
    ],
  },
  {
    id: "20251202-402-create-comments",
    title: "Create comments table (project DB)",
    engine: "any",
    safety: "non_destructive",
    up: [
      { kind: "create_table", tableName: "comments", ifNotExists: true },
    ],
    down: [
      { kind: "drop_table", tableName: "comments", ifExists: true },
    ],
  },
];
