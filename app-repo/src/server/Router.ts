import { IncomingMessage, ServerResponse } from "http";
import { parse } from "url";
import { randomUUID } from "crypto";
import { RequestContext } from "./ServerContext";

export type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, ctx: RequestContext) => void | Promise<void>;

interface Route {
  method: string;
  pattern: string;
  handler: Handler;
  paramNames: string[];
  regex: RegExp;
}

export class Router {
  private routes: Route[] = [];

  get(path: string, handler: Handler): void {
    this.add("GET", path, handler);
  }

  post(path: string, handler: Handler): void {
    this.add("POST", path, handler);
  }

  private add(method: string, path: string, handler: Handler): void {
    const paramNames: string[] = [];
    // Convert path to regex, e.g. /api/projects/:projectId -> ^/api/projects/([^/]+)$
    const regexPath = path.replace(/:([^/]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return "([^/]+)";
    });
    const regex = new RegExp(`^${regexPath}$`);
    this.routes.push({ method, pattern: path, handler, paramNames, regex });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const origin = req.headers["origin"];
        if (origin && !Array.isArray(origin) && 
            (origin === "http://localhost:5173" || origin === "http://127.0.0.1:5173") &&
            process.env["FOLE_DEV_ALLOW_MODE_OVERRIDES"] === "1" &&
            process.env["FOLE_DEV_ENABLE_DEBUG_ENDPOINTS"] === "1") {
             
             res.setHeader("Access-Control-Allow-Origin", origin);
             res.setHeader("Access-Control-Allow-Credentials", "true");
             res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
             res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Dev-Auth");
             res.setHeader("Vary", "Origin");
             
             if (req.method === "OPTIONS") {
                 res.statusCode = 204;
                 res.end();
                 return;
             }
        }
    } catch (e) {
        // ignore
    }

    const { method, url } = req;
    if (!url) return;
    
    // Simple basic auth or other middleware could go here
    
    const parsedUrl = parse(url, true);
    const pathname = parsedUrl.pathname || "";

    for (const route of this.routes) {
      if (route.method === method && route.regex.test(pathname)) {
        const match = pathname.match(route.regex);
        const params: Record<string, string> = {};
        if (match) {
          route.paramNames.forEach((name, index) => {
            params[name] = match[index + 1];
          });
        }
        
        try {
          const ctx: RequestContext = {
            requestId: randomUUID(),
            remoteAddress: req.socket.remoteAddress || "",
            req
          };
          await route.handler(req, res, params, ctx);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Handler error:", err);
          if (!res.headersSent) {
             this.json(res, 500, { ok: false, error: "Internal Server Error" });
          }
        }
        return;
      }
    }

    this.json(res, 404, { ok: false, error: "Not Found" });
  }

  json(res: ServerResponse, status: number, body: unknown): void {
    if (res.headersSent) return;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  }

  async readJsonBody(req: IncomingMessage, maxBytes = 5 * 1024 * 1024): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = "";
      let bytesRead = 0;
      
      req.on("data", (chunk) => {
        data += chunk;
        bytesRead += chunk.length;
        if (bytesRead > maxBytes) {
          req.destroy();
          reject(new Error("Payload too large"));
        }
      });

      req.on("end", () => {
        try {
          if (!data) return resolve({}); 
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error("Invalid JSON"));
        }
      });

      req.on("error", (err) => reject(err));
    });
  }
}
