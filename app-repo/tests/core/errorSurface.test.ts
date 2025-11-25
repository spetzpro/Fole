import { getErrorSurface } from "../../src/core/ui/ErrorSurface";

function runErrorSurfaceTests(): void {
  const surface = getErrorSurface();

  surface.clearAll();

  surface.reportError("simple error");
  surface.reportError(new Error("boom"));

  const notifications = surface.getNotifications();

  if (notifications.length < 2) {
    throw new Error("Expected at least 2 notifications");
  }

  for (const n of notifications) {
    if (!n.id || !n.message) {
      throw new Error("Notification missing id or message");
    }
  }
}

runErrorSurfaceTests();
