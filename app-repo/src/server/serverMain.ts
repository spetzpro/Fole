import http from "http";
import * as path from "path";
import { Router } from "./Router";
import { ShellConfigRepository } from "./ShellConfigRepository";

// Default to port 3000, or use env var
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function main() {
  const router = new Router();
  const configRepo = new ShellConfigRepository(process.cwd());

  // Health check endpoint
  router.get("/api/health", (_req, res) => {
    router.json(res, 200, { ok: true });
  });

  // Shell Config Endpoints
  router.get("/api/config/shell/active", async (_req, res) => {
    try {
      const active = await configRepo.getActivePointer();
      if (!active) {
        return router.json(res, 404, { error: "No active configuration found" });
      }
      router.json(res, 200, active);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error fetching active config", err);
      router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  router.get("/api/config/shell/versions/:versionId", async (_req, res, params) => {
    const versionId = params.versionId;
    if (!versionId) {
      return router.json(res, 400, { error: "Missing versionId" });
    }

    try {
      const bundle = await configRepo.getBundle(versionId);
      router.json(res, 200, bundle);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return router.json(res, 404, { error: err.message });
      }
      // eslint-disable-next-line no-console
      console.error("Error fetching bundle", err);
      router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  const server = http.createServer((req, res) => {
    router.handle(req, res).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Unhandle server error", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://127.0.0.1:${PORT}`);
  });
}

// Run only when executed directly
if (require.main === module) {
  // eslint-disable-next-line no-floating-promises
  main();
}
