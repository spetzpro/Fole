import * as http from "http";
import * as url from "url";

export interface ClientRuntimeConfig {
    baseUrl: string; // e.g. "http://127.0.0.1:3000"
    devMode?: boolean; // optional override; default false
}

export interface ClientRuntime {
    config: ClientRuntimeConfig;
    getBundle(): any | undefined;
    loadActiveBundle(): Promise<any>; // fetches /api/config/shell/bundle (no versionId) and stores it
    resolveRoute(entrySlug: string, devAuth?: { permissions?: string[], roles?: string[] }): Promise<any>; // calls /api/routing/resolve/:entrySlug with optional x-dev-auth header
    dispatchDebugAction(req: { sourceBlockId: string; actionName: string; payload?: any; permissions?: string[]; roles?: string[] }): Promise<any>; // POST /api/debug/action/dispatch
}

export function createClientRuntime(config: ClientRuntimeConfig): ClientRuntime {
    let currentBundle: any | undefined;

    const makeRequest = (method: string, endpoint: string, body?: any, headers: Record<string, string> = {}): Promise<any> => {
        return new Promise((resolve, reject) => {
            const parsedUrl = url.parse(config.baseUrl + endpoint);
            const postData = body ? JSON.stringify(body) : undefined;
            
            const options: http.RequestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port, // Can be string or number, http.request handles it
                path: parsedUrl.path,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                    ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
                }
            };

            const req = http.request(options, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    if (!res.statusCode) {
                        return reject(new Error("No status code received"));
                    }
                    
                    try {
                         const json = responseData ? JSON.parse(responseData) : {};
                         if (res.statusCode >= 200 && res.statusCode < 300) {
                             resolve(json);
                         } else {
                             // Reject with status and error message to caller can handle
                             const err: any = new Error(json.error || `Request failed with status ${res.statusCode}`);
                             err.status = res.statusCode;
                             err.data = json;
                             reject(err);
                         }
                    } catch (e) {
                         reject(new Error(`Failed to parse response: ${responseData}`));
                    }
                });
            });

            req.on('error', reject);
            if (postData) {
                req.write(postData);
            }
            req.end();
        });
    };

    const loadActiveBundle = async (): Promise<any> => {
        try {
            const bundle = await makeRequest("GET", "/api/config/shell/bundle");
            currentBundle = bundle;
            return bundle;
        } catch (err: any) {
            // "Throw on non-200" is handled by makeRequest rejection
            throw err;
        }
    };

    const resolveRoute = async (entrySlug: string, devAuth?: { permissions?: string[], roles?: string[] }): Promise<any> => {
        const headers: Record<string, string> = {};
        if (devAuth) {
            headers['x-dev-auth'] = JSON.stringify(devAuth);
        }
        return makeRequest("GET", `/api/routing/resolve/${encodeURIComponent(entrySlug)}`, undefined, headers);
    };

    const dispatchDebugAction = async (req: { sourceBlockId: string; actionName: string; payload?: any; permissions?: string[]; roles?: string[] }): Promise<any> => {
        if (!config.devMode) {
             // Return fail-closed object without throwing
             return {
                 status: 403,
                 error: "Forbidden: Developer Mode required"
             };
        }

        try {
            return await makeRequest("POST", "/api/debug/action/dispatch", req);
        } catch (err: any) {
            if (err.status) {
                // If the server returns 403/400/500, we return it as an object per prompt 'assert response has applied/skipped/logs' implies we want the response body, even if error?
                // Actually prompt says "dispatchDebugAction must refuse unless config.devMode === true... return {error, status: 403}". 
                // For server errors, makeRequest rejects.
                // If strict parity with 'fetch' style is desired where 4xx is not thrown, we might want to catch here.
                // However, "determinism" suggests throwing on network/protocol failure, but returning result on logic failure?
                // The prompt says "Fail-closed... return object... without throwing".
                // I will catch errors that have a status code and return the data object, simulating a non-throwing client for 4xx replies.
                return {
                    status: err.status,
                    error: err.message,
                    ...err.data
                };
            }
            throw err;
        }
    };

    return {
        config,
        getBundle: () => currentBundle,
        loadActiveBundle,
        resolveRoute,
        dispatchDebugAction
    };
}
