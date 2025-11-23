import type { ProjectUUID } from "../storage/StoragePaths";
import type { DalContext } from "../db/DalContext";
import { executeReadMany, executeReadOne, executeWrite } from "../db/DbHelpers";

/**
 * ExampleProjectRegistryService
 *
 * This is an illustrative, non-authoritative example of how higher-level
 * services can interact with the DAL using the DbHelpers convenience
 * functions. It is not a final schema or API contract.
 */

export interface ExampleProjectRecord {
  readonly id: ProjectUUID;
  readonly name: string;
}

export class ExampleProjectRegistryService {
  private readonly dal: DalContext;

  constructor(dal: DalContext) {
    this.dal = dal;
  }

  async listProjects(): Promise<ReadonlyArray<ExampleProjectRecord>> {
    const coreDb = this.dal.getCoreDb();
    const conn = await coreDb.getConnection();

    // Illustrative only: table/columns are placeholders.
    const rows = await executeReadMany<ExampleProjectRecord>(
      conn,
      "SELECT id, name FROM projects ORDER BY name ASC"
    );
    return rows;
  }

  async getProjectById(projectId: ProjectUUID): Promise<ExampleProjectRecord | undefined> {
    const coreDb = this.dal.getCoreDb();
    const conn = await coreDb.getConnection();

    const row = await executeReadOne<ExampleProjectRecord>(
      conn,
      "SELECT id, name FROM projects WHERE id = ?",
      [projectId]
    );
    return row;
  }

  async createProject(project: ExampleProjectRecord): Promise<void> {
    const coreDb = this.dal.getCoreDb();
    const conn = await coreDb.getConnection();

    await executeWrite(
      conn,
      "INSERT INTO projects (id, name) VALUES (?, ?)",
      [project.id, project.name]
    );
  }
}
