import { DatabaseSync } from "node:sqlite";
import type { Database, Statement } from "../apps/sites/types.js";
export class TestDatabase implements Database {
  readonly sql = new DatabaseSync(":memory:");
  private queue: Promise<unknown> = Promise.resolve();
  constructor() {
    this.sql.exec("PRAGMA foreign_keys=ON");
  }
  prepare(query: string): Statement {
    let values: any[] = [];
    const database = this.sql;
    const execute = () => {
      const s = database.prepare(query);
      const results = s.all(...values);
      const meta = database
        .prepare("SELECT changes() changes,last_insert_rowid() last_row_id")
        .get() as any;
      return { results, meta };
    };
    const statement: Statement = {
      bind(...v) {
        values = v;
        return statement;
      },
      async all() {
        return execute() as any;
      },
      async first(column) {
        const row = execute().results[0];
        return ((column ? row?.[column] : row) as any) || null;
      },
      async run() {
        return execute();
      },
      async raw() {
        return execute().results.map((r) => Object.values(r)) as any;
      },
    };
    return statement;
  }
  batch(statements: Statement[]) {
    const result = this.queue.then(() => this.executeBatch(statements));
    this.queue = result.catch(() => {});
    return result;
  }
  private async executeBatch(statements: Statement[]) {
    this.sql.exec("BEGIN IMMEDIATE");
    try {
      const out = [];
      for (const s of statements) out.push(await s.all());
      this.sql.exec("COMMIT");
      return out as any;
    } catch (e) {
      this.sql.exec("ROLLBACK");
      throw e;
    }
  }
  async exec(query: string) {
    this.sql.exec(query);
    return { count: 1, duration: 0 };
  }
}
