import path from "path";
import { promises as fs } from "fs";
import { CoreRuntime } from "../src/core/CoreRuntime";
import { ProjectDb } from "../src/core/ProjectDb";
import { createProjectMembershipService } from "../src/core/ProjectMembershipService";

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

async function run(): Promise<void> {
  const storageRoot = path.join(process.cwd(), "localstorage");
  const projectsRoot = path.join(storageRoot, "projects");
  const devUserId = resolveDevUserId();

  await fs.mkdir(storageRoot, { recursive: true });
  await fs.rm(projectsRoot, { recursive: true, force: true });
  await fs.mkdir(projectsRoot, { recursive: true });

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

  const projectDirs = (await fs.readdir(projectsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (projectDirs.length !== 1 || projectDirs[0] !== projectId) {
    throw new Error(`Expected exactly one project directory matching ${projectId}, found: ${projectDirs.join(", ") || "<none>"}`);
  }

  await fs.access(projectDbPath);

  console.log(`PROJECT_ID=${projectId}`);
  console.log(`DEV_USER_ID=${devUserId}`);
  console.log(`PROJECT_DB=${projectDbPath}`);
}

const timeoutHandle = setTimeout(() => {
  console.error(`create_one_localstorage_project timed out after ${SCRIPT_TIMEOUT_MS}ms`);
  process.exit(1);
}, SCRIPT_TIMEOUT_MS);

void run()
  .then(() => {
    clearTimeout(timeoutHandle);
    process.exit(0);
  })
  .catch((error) => {
    clearTimeout(timeoutHandle);
    console.error("create_one_localstorage_project failed", error);
    process.exit(1);
  });
