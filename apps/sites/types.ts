export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = any>(column?: string): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
  raw<T = unknown[]>(): Promise<T[]>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch<T = any>(
    queries: Statement[],
  ): Promise<{ results: T[]; meta?: { changes: number } }[]>;
  exec(sql: string): Promise<unknown>;
}
export interface Environment {
  DB: Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  APP_URL: string;
  BETTER_AUTH_SECRET: string;
}
