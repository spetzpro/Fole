// TODO: replace shim with real CoreDb wiring (DalContext / ProjectDb / etc.)

/**
 * Shim for getCoreDb to unblock compilation.
 * This function returns 'any' to allow legacy usages (db.run, db.get) to compile
 * without strictly typing the sqlite3 surface area or importing 'sqlite3'.
 */
export function getCoreDb(): any {
  throw new Error("getCoreDb not implemented: CoreDb shim");
}
