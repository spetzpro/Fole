import { RequestContext } from "./ServerContext";

export class ModeGate {
  static canUseAdvancedMode(ctx: RequestContext): boolean {
    return false;
  }

  static canUseDeveloperMode(ctx: RequestContext): boolean {
    // Default: fail-closed
    
    // Check for dev override
    if (this.isLocalhost(ctx.remoteAddress)) {
      const allowOverrides = process.env.FOLE_DEV_ALLOW_MODE_OVERRIDES === "1" || process.env.FOLE_DEV_ALLOW_MODE_OVERRIDES === "true";
      const forceInvalidEnabled = process.env.FOLE_DEV_FORCE_INVALID_CONFIG === "1" || process.env.FOLE_DEV_FORCE_INVALID_CONFIG === "true";
      
      if (allowOverrides && forceInvalidEnabled) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Checks if Debug Endpoints (/api/debug/*) are enabled/exposed.
   * Controlled by FOLE_DEV_ENABLE_DEBUG_ENDPOINTS=1
   */
  static debugEndpointsEnabled(ctx: RequestContext): boolean {
    if (!this.isLocalhost(ctx.remoteAddress)) {
        return false;
    }
    const enableDebug = process.env.FOLE_DEV_ENABLE_DEBUG_ENDPOINTS === "1" || process.env.FOLE_DEV_ENABLE_DEBUG_ENDPOINTS === "true";
    return enableDebug;
  }

  /**
   * Checks if Dev-Auth Bypass (X-Dev-Auth header) is allowed for governed endpoints.
   * Controlled by FOLE_DEV_ALLOW_MODE_OVERRIDES=1
   */
  static canUseDevAuthBypass(ctx: RequestContext): boolean {
    if (!this.isLocalhost(ctx.remoteAddress)) {
        return false;
    }
    const allowOverrides = process.env.FOLE_DEV_ALLOW_MODE_OVERRIDES === "1" || process.env.FOLE_DEV_ALLOW_MODE_OVERRIDES === "true";
    return allowOverrides;
  }

  /**
   * @deprecated Use debugEndpointsEnabled(ctx) or canUseDevAuthBypass(ctx) depending on intent.
   * Kept for brief compatibility, logic matches new debugEndpointsEnabled but is functionally split in callers.
   */
  static canUseDebugEndpoints(ctx: RequestContext): boolean {
    return this.debugEndpointsEnabled(ctx);
  }

  private static isLocalhost(ip: string): boolean {
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  }
}
