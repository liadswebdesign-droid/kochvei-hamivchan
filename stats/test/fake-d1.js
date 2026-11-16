// A small D1 stand-in on node:sqlite, so the real SQL in src/worker.js and schema.sql runs in tests.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = fs.readFileSync(path.resolve(import.meta.dirname, '../schema.sql'), 'utf8');

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  const exec = (sql, args) => {
    const st = db.prepare(sql);
    if (/^\s*SELECT/i.test(sql)) return { success: true, results: st.all(...args), meta: {} };
    const r = st.run(...args);
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  };
  const stmt = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => stmt(sql, a),
    all: async () => exec(sql, args),
    run: async () => exec(sql, args),
    first: async () => exec(sql, args).results[0] ?? null,
    _exec: () => exec(sql, args),
  });
  return {
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = list.map((s) => s._exec());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    raw: db,
  };
}
