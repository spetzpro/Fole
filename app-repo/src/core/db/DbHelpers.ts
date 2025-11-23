import type { DbCommand, DbCommandResult, DbConnection, DbQuery } from "./DalContext";

export async function executeWrite(conn: DbConnection, text: string, parameters?: ReadonlyArray<unknown>): Promise<DbCommandResult> {
  const command: DbCommand = { type: "custom", text, parameters };
  return conn.executeCommand(command);
}

export async function executeReadOne<TResult = unknown>(
  conn: DbConnection,
  text: string,
  parameters?: ReadonlyArray<unknown>
): Promise<TResult | undefined> {
  const query: DbQuery = { text, parameters };
  const rows = await conn.executeQuery<TResult>(query);
  return rows[0];
}

export async function executeReadMany<TResult = unknown>(
  conn: DbConnection,
  text: string,
  parameters?: ReadonlyArray<unknown>
): Promise<ReadonlyArray<TResult>> {
  const query: DbQuery = { text, parameters };
  return conn.executeQuery<TResult>(query);
}
