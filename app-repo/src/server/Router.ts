import { IncomingMessage, ServerResponse } from "http";
import { parse } from "url";

export type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => void | Promise<void>;

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
          await route.handler(req, res, params);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Handler error:", err);
          this.json(res, 500, { ok: false, error: "Internal Server Error" });
        }
        return;
      }
    }

    this.json(res, 404, { ok: false, error: "Not Found" });
  }

  json(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  }
}
