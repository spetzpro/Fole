
import { RequestContext } from "./ServerContext";
import { ModeGate } from "./ModeGate";

export const DEBUG_PERMISSION = "sysadmin.dev";
export const DEBUG_ROLE = "SYSADMIN";

/**
 * Checks if the current request is allowed to access debug endpoints.
 * Requires:
 * 1. ModeGate.canUseDebugEndpoints(ctx) to return true (Environment flag)
 * 2. Valid X-Dev-Auth header with required permission/role (Permission check)
 */
export function canAccessDebug(ctx: RequestContext): boolean {
    // 1. Server Flag Check
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
        return false;
    }

    // 2. Permission Check
    // Since we are in a dev/debug mode context, we expect the X-Dev-Auth header
    // to function as our identity provider for these protected routes.
    const req = ctx.req;
    const authHeader = req.headers["x-dev-auth"] as string | undefined;

    if (!authHeader) {
        return false;
    }

    try {
        const json = JSON.parse(authHeader);
        
        // Check permissions
        if (Array.isArray(json.permissions) && json.permissions.includes(DEBUG_PERMISSION)) {
            return true;
        }
        
        // Check roles
        if (Array.isArray(json.roles) && json.roles.includes(DEBUG_ROLE)) {
            return true;
        }
    } catch (e) {
        // Parse error -> deny
        return false;
    }

    return false;
}
