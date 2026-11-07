import { AsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { UnitOfWork } from '../application/ports';

export interface QueryExecutor {
  query<T extends RowDataPacket[] | ResultSetHeader>(sql: string, values?: any): Promise<[T, any]>;
  execute<T extends RowDataPacket[] | ResultSetHeader>(sql: string, values?: any): Promise<[T, any]>;
}

export class Database {
  public readonly pool: Pool;
  private readonly als = new AsyncLocalStorage<PoolConnection>();

  constructor(databaseUrl: string) {
    this.pool = mysql.createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: 15,
      multipleStatements: true,
      timezone: 'Z',
      dateStrings: false,
    });
  }

  public conn(): QueryExecutor {
    return this.als.getStore() ?? this.pool;
  }

  public async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.als.getStore()) {
      return work();
    }
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const res = await this.als.run(conn, work);
      await conn.commit();
      return res;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  public async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export class MySqlUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}

  public run<T>(work: () => Promise<T>): Promise<T> {
    return this.db.runInTransaction(work);
  }
}

export async function runMigrations(db: Database, migrationsDir?: string): Promise<void> {
  const dir = migrationsDir ?? path.resolve(process.cwd(), 'migrations');
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const executor = db.conn();
  for (const file of files) {
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    await executor.query(sql);
  }
}

export async function waitForDatabase(db: Database, maxAttempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await db.ping()) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('Database did not become ready in time.');
}
