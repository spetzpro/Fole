import * as path from "path";
import * as fs from "fs";
import { CoreRuntime } from "app/core/CoreRuntime";
import { ProjectDb } from "app/core/ProjectDb";
import { createProjectMembershipService } from "app/core/ProjectMembershipService";
import { createFileService } from "app/feature/files/FileService";
import { initDefaultPolicies } from "app/core/permissions/PolicyRegistry";
import { getPermissionService } from "app/core/permissions/PermissionService";
import { setCurrentUserProvider, type CurrentUserProvider } from "app/core/auth/CurrentUserProvider";
import type { CurrentUser } from "app/core/auth/CurrentUserTypes";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

class TestCurrentUserProvider implements CurrentUserProvider {
  constructor(private readonly user: CurrentUser | null) {}

  getCurrentUser(): CurrentUser | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return this.user != null;
  }
}

async function setup(projectId: string) {
  const root = path.join(process.cwd(), "tmp-files-permissions-tests");
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  const runtime = new CoreRuntime({
    storageRoot: root,
    useInMemoryDal: true,
    useDalLocks: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const projectDb = new ProjectDb(runtime);
  const membershipService = createProjectMembershipService(projectDb);

  const conn = await projectDb.getConnection(projectId);
  await conn.executeCommand({
    type: "ddl",
    text: `CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    )`,
    parameters: [],
  });

  initDefaultPolicies();
  const permissionService = getPermissionService();

  const fileService = createFileService({ projectDb, membershipService });

  return { root, projectDb, membershipService, permissionService, fileService };
}

async function runFilesPermissionsTests(): Promise<void> {
  const projectId = "proj-files-1";
  const { membershipService, fileService } = await setup(projectId);

  // OWNER with membership can upload/delete
  {
    await membershipService.addOrUpdateMembership(projectId, "user-owner", "OWNER");

    const ownerUser: CurrentUser = {
      id: "user-owner",
      displayName: "Owner User",
      roles: ["OWNER"],
    };
    setCurrentUserProvider(new TestCurrentUserProvider(ownerUser));

    const uploadResult = await fileService.uploadFile(projectId, {
      name: "doc-owner.txt",
      contentType: "text/plain",
      sizeBytes: 123,
    });
    assert(uploadResult.ok, "OWNER upload should succeed");

    const fileId = uploadResult.ok ? uploadResult.value.fileId : "";

    const deleteResult = await fileService.deleteFile(projectId, fileId);
    assert(deleteResult.ok, "OWNER delete should succeed");
  }

  // EDITOR with membership can upload/delete
  {
    await membershipService.addOrUpdateMembership(projectId, "user-editor", "EDITOR");

    const editorUser: CurrentUser = {
      id: "user-editor",
      displayName: "Editor User",
      roles: ["EDITOR"],
    };
    setCurrentUserProvider(new TestCurrentUserProvider(editorUser));

    const uploadResult = await fileService.uploadFile(projectId, {
      name: "doc-editor.txt",
      contentType: "text/plain",
      sizeBytes: 456,
    });
    assert(uploadResult.ok, "EDITOR upload should succeed");

    const fileId = uploadResult.ok ? uploadResult.value.fileId : "";

    const deleteResult = await fileService.deleteFile(projectId, fileId);
    assert(deleteResult.ok, "EDITOR delete should succeed");
  }

  // VIEWER with membership cannot upload/delete
  {
    await membershipService.addOrUpdateMembership(projectId, "user-viewer", "VIEWER");

    const viewerUser: CurrentUser = {
      id: "user-viewer",
      displayName: "Viewer User",
      roles: ["VIEWER"],
    };
    setCurrentUserProvider(new TestCurrentUserProvider(viewerUser));

    const uploadResult = await fileService.uploadFile(projectId, {
      name: "doc-viewer.txt",
      contentType: "text/plain",
      sizeBytes: 789,
    });
    assert(!uploadResult.ok, "VIEWER upload should be denied");
    assert(
      !uploadResult.ok && uploadResult.error.code === "PERMISSION_DENIED",
      "VIEWER upload should be PERMISSION_DENIED",
    );

    // Attempt delete on a file owned by projectId as viewer
    const ownerUpload = await fileService.uploadFile(projectId, {
      name: "doc-owner-for-viewer.txt",
      contentType: "text/plain",
      sizeBytes: 111,
    });
    assert(ownerUpload.ok, "Owner-created file upload for viewer test should succeed");
    const ownerFileId = ownerUpload.ok ? ownerUpload.value.fileId : "";

    const deleteResult = await fileService.deleteFile(projectId, ownerFileId);
    assert(!deleteResult.ok, "VIEWER delete should be denied");
    assert(
      !deleteResult.ok && deleteResult.error.code === "PERMISSION_DENIED",
      "VIEWER delete should be PERMISSION_DENIED",
    );
  }

  // Non-member cannot upload/delete
  {
    const outsiderUser: CurrentUser = {
      id: "user-outsider",
      displayName: "Outsider User",
      roles: ["EDITOR"],
    };
    setCurrentUserProvider(new TestCurrentUserProvider(outsiderUser));

    const uploadResult = await fileService.uploadFile(projectId, {
      name: "doc-outsider.txt",
      contentType: "text/plain",
      sizeBytes: 222,
    });
    assert(!uploadResult.ok, "Non-member upload should be denied");
    assert(
      !uploadResult.ok && uploadResult.error.code === "PERMISSION_DENIED",
      "Non-member upload should be PERMISSION_DENIED",
    );
  }

  // Wrong-project membership / RESOURCE_NOT_IN_PROJECT
  {
    const projectIdParam = "proj-other";
    const wrongProjectFileId = "file-wrong-project";

    const { projectDb } = await setup(projectIdParam);
    const conn = await projectDb.getConnection(projectId);
    await conn.executeCommand({
      type: "insert",
      text:
        "INSERT INTO files (id, project_id, original_name, mime_type, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      parameters: [
        wrongProjectFileId,
        projectId,
        "wrong-project.txt",
        "text/plain",
        10,
        new Date().toISOString(),
        "user-owner",
      ],
    });

    await membershipService.addOrUpdateMembership(projectIdParam, "user-owner", "OWNER");

    const ownerOtherProject: CurrentUser = {
      id: "user-owner",
      displayName: "Owner Other Project",
      roles: ["OWNER"],
    };
    setCurrentUserProvider(new TestCurrentUserProvider(ownerOtherProject));

    const deleteResult = await fileService.deleteFile(projectIdParam, wrongProjectFileId);
    assert(!deleteResult.ok, "Delete on mismatched project should be denied");
    assert(
      !deleteResult.ok &&
        deleteResult.error.code === "PERMISSION_DENIED" &&
        (deleteResult.error as any).details?.reasonCode === "RESOURCE_NOT_IN_PROJECT",
      "Expected RESOURCE_NOT_IN_PROJECT reason code for mismatched project delete",
    );
  }
}

runFilesPermissionsTests().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("filesPermissions tests failed", err);
  process.exitCode = 1;
});
