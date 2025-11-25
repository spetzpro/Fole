import type { CoreRuntime } from "./CoreRuntime";
import { runProjectConfigAndMetadataJobs } from "./ProjectJobs";
import { ProjectDb } from "./ProjectDb";
import { ProjectLocalSettingsRepository } from "./ProjectLocalSettingsRepository";

export interface InitializeProjectOptions {
  readonly projectId: string;
  readonly author: string;
  readonly initialSettings?: Record<string, unknown>;
}

export interface InitializeProjectResult {
  readonly projectId: string;
  readonly configJobId: string;
  readonly metadataJobId: string;
}

export class ProjectService {
  private readonly projectDb: ProjectDb;
  private readonly settingsRepository: ProjectLocalSettingsRepository;

  constructor(private readonly runtime: CoreRuntime) {
    this.projectDb = new ProjectDb(runtime);
    this.settingsRepository = new ProjectLocalSettingsRepository(this.projectDb);
  }

  async initializeProject(options: InitializeProjectOptions): Promise<InitializeProjectResult> {
    const { projectId, author, initialSettings } = options;

    const jobsResult = await runProjectConfigAndMetadataJobs(this.runtime, {
      projectId,
      author,
    });

    if (initialSettings) {
      const entries = Object.entries(initialSettings);
      for (const [key, value] of entries) {
        await this.settingsRepository.upsertSetting(projectId, key, value);
      }
    }

    return {
      projectId,
      configJobId: jobsResult.configJob.job.id,
      metadataJobId: jobsResult.metadataJob.job.id,
    };
  }

  async getProjectSetting(projectId: string, key: string) {
    return this.settingsRepository.getSetting(projectId, key);
  }

  async updateProjectSetting(projectId: string, key: string, valueJson: unknown): Promise<void> {
    await this.settingsRepository.upsertSetting(projectId, key, valueJson);
  }
}
