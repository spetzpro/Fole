import type { MigrationDefinition, MigrationId, PlannedMigration } from "./MigrationTypes";

export interface MigrationPlan {
  readonly ordered: readonly PlannedMigration[];
}

export interface MigrationPlannerOptions {
  readonly engine: "sqlite" | "postgres";
}

export class MigrationPlanner {
  private readonly engine: "sqlite" | "postgres";

  constructor(options: MigrationPlannerOptions) {
    this.engine = options.engine;
  }

  plan(migrations: readonly MigrationDefinition[]): MigrationPlan {
    const relevant = migrations.filter((m) => m.engine === "any" || m.engine === this.engine);

    const seen = new Set<MigrationId>();
    const ordered = [...relevant].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const planned: PlannedMigration[] = [];
    for (const m of ordered) {
      if (seen.has(m.id)) {
        throw new Error(`Duplicate migration id detected: ${m.id}`);
      }
      seen.add(m.id);
      planned.push({ id: m.id, title: m.title, steps: m.up });
    }

    return { ordered: planned };
  }
}
