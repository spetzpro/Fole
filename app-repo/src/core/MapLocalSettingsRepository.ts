import type { DbConnection } from "./db/DalContext";
import { executeReadOne, executeWrite } from "./db/DbHelpers";
import { MapDb } from "./MapDb";

export interface MapLocalSetting {
  readonly projectId: string;
  readonly mapId: string;
  readonly key: string;
  readonly valueJson: unknown;
}

export class MapLocalSettingsRepository {
  constructor(private readonly mapDb: MapDb) {}

  private async getConnection(projectId: string, mapId: string): Promise<DbConnection> {
    return this.mapDb.getConnection(projectId, mapId);
  }

  async getSetting(projectId: string, mapId: string, key: string): Promise<MapLocalSetting | undefined> {
    const conn = await this.getConnection(projectId, mapId);
    const row = await executeReadOne<{ project_id: string; map_id: string; key: string; value_json: unknown }>(
      conn,
      {
        text: "SELECT project_id, map_id, key, value_json FROM map_settings WHERE project_id = ? AND map_id = ? AND key = ?",
        parameters: [projectId, mapId, key],
      },
    );

    if (!row) {
      return undefined;
    }

    return {
      projectId: row.project_id,
      mapId: row.map_id,
      key: row.key,
      valueJson: row.value_json,
    };
  }

  async upsertSetting(projectId: string, mapId: string, key: string, valueJson: unknown): Promise<void> {
    const conn = await this.getConnection(projectId, mapId);

    await executeWrite(conn, {
      type: "update",
      text: "INSERT INTO map_settings (project_id, map_id, key, value_json) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, map_id, key) DO UPDATE SET value_json = excluded.value_json",
      parameters: [projectId, mapId, key, valueJson],
    });
  }
}
