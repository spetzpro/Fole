import path from "path";
import { promises as fs } from "fs";
import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ProjectDb } from "../../src/core/ProjectDb";
import { createProjectMembershipService } from "../../src/core/ProjectMembershipService";

const SCRIPT_TIMEOUT_MS = 30_000;

function resolveDevUserId(): string {
  const envUserId = process.env.FOLE_DEV_USER_ID?.trim();
  if (envUserId) return envUserId;

  const devAuthRaw = process.env.FOLE_DEV_AUTH?.trim();
  if (devAuthRaw) {
    try {
      const parsed = JSON.parse(devAuthRaw);
      if (typeof parsed?.userId === "string" && parsed.userId.trim().length > 0) {
        return parsed.userId.trim();
      }
    } catch {
      // Ignore malformed env value and fall back.
    }
  }

  return "dev-user";
}

async function listProjectDirs(projectsRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function run(): Promise<void> {
  const storageRoot = path.join(process.cwd(), "localstorage");
  const projectsRoot = path.join(storageRoot, "projects");
  const devUserId = resolveDevUserId();
  const force = process.argv.includes("--force");

  await fs.mkdir(projectsRoot, { recursive: true });

  const existingProjectIds = await listProjectDirs(projectsRoot);

  if (existingProjectIds.length > 0 && !force) {
    console.error("Refusing to modify existing local projects (safe default).");
    console.error(`Found projectIds under ${projectsRoot}:`);
    for (const projectId of existingProjectIds) {
      console.error(`- ${projectId}`);
    }
    console.error("Run again with --force to wipe localstorage/projects and recreate exactly one project.");
    process.exit(2);
  }

  if (force) {
    await fs.rm(projectsRoot, { recursive: true, force: true });
    await fs.mkdir(projectsRoot, { recursive: true });
  }

  const runtime = new CoreRuntime({ storageRoot });
  const projectDb = new ProjectDb(runtime);
  const membershipService = createProjectMembershipService(projectDb);
  const created = await runtime.projectRegistry.createProject("Manual UI Test Project");
  if (!created.ok) {
    throw new Error(`Failed to create project: ${created.error.code} ${created.error.message}`);
  }

  const projectId = created.value.id;
  const projectDbPath = path.join(projectsRoot, projectId, "project.db");

  await membershipService.addOrUpdateMembership(projectId, devUserId, "OWNER");

  const projectDirs = await listProjectDirs(projectsRoot);
  if (projectDirs.length !== 1 || projectDirs[0] !== projectId) {
    throw new Error(`Expected exactly one project directory matching ${projectId}, found: ${projectDirs.join(", ") || "<none>"}`);
  }

  await fs.access(projectDbPath);

  console.log(`PROJECT_ID=${projectId}`);
  console.log(`DEV_USER_ID=${devUserId}`);
  console.log(`PROJECT_DB=${projectDbPath}`);
  console.log(`MODE=${force ? "force" : "safe-default"}`);
}

const timeoutHandle = setTimeout(() => {
  console.error(`ensure_one_local_project timed out after ${SCRIPT_TIMEOUT_MS}ms`);
  process.exit(1);
}, SCRIPT_TIMEOUT_MS);

void run()
  .then(() => {
    clearTimeout(timeoutHandle);
    process.exit(0);
  })
  .catch((error) => {
    clearTimeout(timeoutHandle);
    console.error("ensure_one_local_project failed", error);
    process.exit(1);
  });
