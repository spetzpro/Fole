import type { DbCommand, DbCommandResult, DbConnection, DbQuery } from "./DalContext";

export async function executeWrite(
  conn: DbConnection,
  commandOrText: string | DbCommand,
  parameters?: ReadonlyArray<unknown>,
): Promise<DbCommandResult> {
  let command: DbCommand;
  if (typeof commandOrText === "string") {
    command = { type: "custom", text: commandOrText, parameters };
  } else {
    command = commandOrText;
  }
  return conn.executeCommand(command);
}

export async function executeReadOne<TResult = unknown>(
  conn: DbConnection,
  queryOrText: string | DbQuery,
  parameters?: ReadonlyArray<unknown>,
): Promise<TResult | undefined> {
  const query: DbQuery = typeof queryOrText === "string" ? { text: queryOrText, parameters } : (queryOrText as DbQuery);
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
