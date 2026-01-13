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

  static canUseDebugEndpoints(ctx: RequestContext): boolean {
    // Fail-Closed: Must be localhost, must define ALLOW_MODE_OVERRIDES, must define ENABLE_DEBUG_ENDPOINTS
    if (!this.isLocalhost(ctx.remoteAddress)) {
        return false;
    }

    const allowOverrides = process.env.FOLE_DEV_ALLOW_MODE_OVERRIDES === "1" || process.env.FOLE_DEV_ALLOW_MODE_OVERRIDES === "true";
    if (!allowOverrides) return false;

    const enableDebug = process.env.FOLE_DEV_ENABLE_DEBUG_ENDPOINTS === "1" || process.env.FOLE_DEV_ENABLE_DEBUG_ENDPOINTS === "true";
    return enableDebug;
  }

  private static isLocalhost(ip: string): boolean {
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  }
}
