import { createNewProject, projectFromJson, projectToJson, type ProjectId } from "../../src/core/storage/model/ProjectModel";

async function run() {
  const id = "proj-1" as ProjectId;
  const now = new Date().toISOString();
  const project = createNewProject(id, "Test Project", now);

  const json = projectToJson(project);
  const roundTripped = projectFromJson(json);

  if (!roundTripped.ok) {
    throw new Error("projectFromJson failed round-trip: " + roundTripped.error.message);
  }

  if (roundTripped.value.id !== project.id) throw new Error("id mismatch");
  if (roundTripped.value.name !== project.name) throw new Error("name mismatch");
  if (roundTripped.value.createdAt !== project.createdAt) throw new Error("createdAt mismatch");
  if (roundTripped.value.lastOpenedAt !== project.lastOpenedAt) throw new Error("lastOpenedAt mismatch");
  if (roundTripped.value.projectVersion !== project.projectVersion) throw new Error("projectVersion mismatch");
  if (roundTripped.value.dbSchemaVersion !== project.dbSchemaVersion) throw new Error("dbSchemaVersion mismatch");

  console.log("projectModel tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
