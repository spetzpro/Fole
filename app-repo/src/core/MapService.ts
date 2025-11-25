import type { CoreRuntime } from "./CoreRuntime";
import { MapOperations } from "./MapOperations";
import { MapDb } from "./MapDb";
import { MapLocalSettingsRepository } from "./MapLocalSettingsRepository";

export interface InitializeMapOptions {
  readonly projectId: string;
  readonly mapId: string;
  readonly author: string;
  readonly initialSettings?: Record<string, unknown>;
}

export interface InitializeMapResult {
  readonly projectId: string;
  readonly mapId: string;
}

export class MapService {
  private readonly mapOps: MapOperations;
  private readonly mapDb: MapDb;
  private readonly settingsRepository: MapLocalSettingsRepository;

  constructor(private readonly runtime: CoreRuntime) {
    this.mapOps = new MapOperations(runtime);
    this.mapDb = new MapDb(runtime);
    this.settingsRepository = new MapLocalSettingsRepository(this.mapDb);
  }

  async initializeMap(options: InitializeMapOptions): Promise<InitializeMapResult> {
    const { projectId, mapId, author, initialSettings } = options;

    await this.mapOps.commitMapSnapshot({ projectId, mapId, author });

    if (initialSettings) {
      const entries = Object.entries(initialSettings);
      for (const [key, value] of entries) {
        await this.settingsRepository.upsertSetting(projectId, mapId, key, value);
      }
    }

    return { projectId, mapId };
  }

  async getMapSetting(projectId: string, mapId: string, key: string) {
    return this.settingsRepository.getSetting(projectId, mapId, key);
  }

  async updateMapSetting(projectId: string, mapId: string, key: string, valueJson: unknown): Promise<void> {
    await this.settingsRepository.upsertSetting(projectId, mapId, key, valueJson);
  }
}
