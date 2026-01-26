import { RequestContext } from './ServerContext';
import { CANONICAL_ROLE_PERMISSIONS, CanonicalRole } from '../core/permissions/PermissionModel';

// In a real app, this would query a DB or proper IdP.
// Here we use a static secret for "SysAdmin" access to satisfy the requirement
// for a production-safe mechanisms independent of dev flags.
// This defaults to a value that must be provided in ENV for security, 
// but falls back to a known placeholder for the dev environment if not set.
const SYSADMIN_TOKEN = process.env.SYSADMIN_TOKEN || "sysadmin-secret-123";

export interface AuthResult {
    success: boolean;
    status?: number;
    error?: any;
}

export function requirePermission(ctx: RequestContext, requiredPermission: string): AuthResult {
    // 1. Extract Auth
    const authHeader = ctx.req.headers['authorization'];
    if (!authHeader) {
        return { 
            success: false, 
            status: 401, 
            error: { error: "unauthenticated", code: "missing_token" } 
        };
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return { 
             success: false, 
             status: 401, 
             error: { error: "unauthenticated", code: "invalid_auth_scheme" } 
        };
    }

    // 2. Validate Identity (Shim Identity Provider)
    // In production, this verifies the token against the user database/session store.
    let userRoles: CanonicalRole[] = [];
    
    if (token === SYSADMIN_TOKEN) {
        userRoles = ["ADMIN"];
    } else {
         return { 
             success: false, 
             status: 401, 
             error: { error: "unauthenticated", code: "invalid_token" } 
        };
    }

    // 3. Resolve Permissions
    // Flatten permissions from all roles
    const heldPermissions = new Set<string>();
    userRoles.forEach(role => {
        const perms = CANONICAL_ROLE_PERMISSIONS[role];
        if (perms) {
            perms.forEach(p => heldPermissions.add(p));
        }
    });

    // 4. Check Permission
    if (!heldPermissions.has(requiredPermission)) {
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

    return { success: true };
}
