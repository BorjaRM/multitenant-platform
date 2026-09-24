import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
type Database = ReturnType<typeof drizzle>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export async function inTransaction<Result>(
  pool: Pool,
  operation: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  const client = await pool.connect();
  let connectionError: Error | undefined;
  const onError = (error: Error) => {
    connectionError = error;
  };
  client.on('error', onError);
  try {
    return await drizzle(client).transaction(operation);
  } catch (error) {
    connectionError ??= error instanceof Error ? error : new Error('Transaction failed');
    throw error;
  } finally {
    client.removeListener('error', onError);
    client.release(connectionError);
  }
}
