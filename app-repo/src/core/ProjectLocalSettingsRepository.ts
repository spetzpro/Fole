import type { DbConnection } from "./db/DalContext";
import { executeReadOne, executeWrite } from "./db/DbHelpers";
import { ProjectDb } from "./ProjectDb";

export interface ProjectLocalSetting {
  readonly projectId: string;
  readonly key: string;
  readonly valueJson: unknown;
}

export class ProjectLocalSettingsRepository {
  constructor(private readonly projectDb: ProjectDb) {}

  private async getConnection(projectId: string): Promise<DbConnection> {
    return this.projectDb.getConnection(projectId);
  }

  async getSetting(projectId: string, key: string): Promise<ProjectLocalSetting | undefined> {
    const conn = await this.getConnection(projectId);
    const row = await executeReadOne<{ project_id: string; key: string; value_json: unknown }>(conn, {
      text: "SELECT project_id, key, value_json FROM project_settings WHERE project_id = ? AND key = ?",
      parameters: [projectId, key],
    });

    if (!row) {
      return undefined;
    }

    return {
      projectId: row.project_id,
      key: row.key,
      valueJson: row.value_json,
    };
  }

  async upsertSetting(projectId: string, key: string, valueJson: unknown): Promise<void> {
    const conn = await this.getConnection(projectId);

    await executeWrite(conn, {
      type: "update",
      text: "INSERT INTO project_settings (project_id, key, value_json) VALUES (?, ?, ?) ON CONFLICT(project_id, key) DO UPDATE SET value_json = excluded.value_json",
      parameters: [projectId, key, valueJson],
    });
  }
}
