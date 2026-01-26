import { RequestContext } from './ServerContext';
import { CANONICAL_ROLE_PERMISSIONS, CanonicalRole } from '../core/permissions/PermissionModel';
import { ModeGate } from './ModeGate';

export interface AuthResult {
    success: boolean;
    status?: number;
    error?: any;
}

export function requirePermission(ctx: RequestContext, requiredPermission: string): AuthResult {
    // 1. Try Real Production Auth
    if (ctx.auth && ctx.auth.roles) {
        // Resolve Permissions from roles
        const heldPermissions = new Set<string>();
        for (const role of ctx.auth.roles) {
             const perms = CANONICAL_ROLE_PERMISSIONS[role as CanonicalRole] || [];
             perms.forEach(p => heldPermissions.add(p));
        }

        if (heldPermissions.has(requiredPermission)) {
            return { success: true };
        }
        
        // Authenticated but forbidden
        return {
            success: false,
            status: 403,
            error: { 
                error: "forbidden", 
                code: "permission_denied", 
                required: [requiredPermission] 
            }
        };
    }

    // 2. Fallback: Dev Mode Extract Access (Explicit Bypass)
    // We intentionally reuse the X-Dev-Auth logic here for dev environment support 
    // strictly when the server is properly configured for it (ModeGate).
    // This allows the existing UI (which sends X-Dev-Auth) to work against these governed endpoints
    // in dev, without inventing a new auth channel.
    if (ModeGate.canUseDevAuthBypass(ctx)) {
         const devHeader = ctx.req.headers["x-dev-auth"] as string | undefined;
         if (devHeader) {
             try {
                 const json = JSON.parse(devHeader);
                 // Check declared roles in header
                 if (Array.isArray(json.roles)) {
                     const heldPermissions = new Set<string>();
                     json.roles.forEach((r: string) => {
                         const perms = CANONICAL_ROLE_PERMISSIONS[r as CanonicalRole] || [];
                         perms.forEach(p => heldPermissions.add(p));
                     });
                     
                     if (heldPermissions.has(requiredPermission)) {
                         return { success: true };
                     }
                 }
                 // Allow explicit permission grants in dev header too
                 if (Array.isArray(json.permissions) && json.permissions.includes(requiredPermission)) {
                     return { success: true };
                 }
             } catch (e) {
                 // ignore parse errors, fall through to 401
             }
         }
    }

    // 3. Not Authenticated
    return { 
        success: false, 
        status: 401, 
        error: { error: "unauthenticated", code: "missing_token" } 
    };
}
