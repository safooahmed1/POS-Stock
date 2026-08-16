import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('TURSO_DATABASE_URL environment variable is required');
}

const client = createClient({ url, authToken });

async function init() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      sku        TEXT UNIQUE,
      price      REAL NOT NULL DEFAULT 0,
      image      TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS variants (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      color      TEXT NOT NULL,
      size       TEXT NOT NULL,
      quantity   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (product_id, color, size)
    );
  `);
}

function mapRows(result) {
  return result.rows.map(row => {
    const obj = {};
    result.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function mapRow(result) {
  const rows = mapRows(result);
  return rows[0] || null;
}

function prepare(sql) {
  return {
    async run(...params) {
      const result = await client.execute({ sql, args: params });
      return {
        lastInsertRowid: result.lastInsertRowid,
        changes: result.rowsAffected
      };
    },
    async get(...params) {
      const result = await client.execute({ sql, args: params });
      return mapRow(result);
    },
    async all(...params) {
      const result = await client.execute({ sql, args: params });
      return mapRows(result);
    },
    async iterate(...params) {
      const result = await client.execute({ sql, args: params });
      return mapRows(result)[Symbol.asyncIterator]();
    }
  };
}

function exec(sql) {
  return client.execute(sql);
}

function transaction(fn) {
  return client.transaction(async (tx) => {
    const txClient = {
      execute: async ({ sql, args }) => tx.execute({ sql, args }),
      prepare: (sql) => ({
        run: async (...params) => {
          const result = await tx.execute({ sql, args: params });
          return { lastInsertRowid: result.lastInsertRowid, changes: result.rowsAffected };
        },
        get: async (...params) => {
          const result = await tx.execute({ sql, args: params });
          return mapRow(result);
        },
        all: async (...params) => {
          const result = await tx.execute({ sql, args: params });
          return mapRows(result);
        }
      })
    };
    return fn(txClient);
  });
}

function pragma() {
  return Promise.resolve();
}

export default {
  prepare,
  exec,
  transaction,
  pragma,
  init
};