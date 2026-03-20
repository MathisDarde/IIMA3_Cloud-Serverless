import { Pool } from "pg";

const dbHost =
  process.env.DB_HOST ??
  process.env.POSTGRES_HOST ??
  process.env.PGHOST ??
  "localhost";
const dbPort = Number(
  process.env.DB_PORT ??
    process.env.POSTGRES_PORT ??
    process.env.PGPORT ??
    5432,
);
const dbUser =
  process.env.DB_USER ??
  process.env.POSTGRES_USER ??
  process.env.PGUSER ??
  "postgres";
const dbPassword = String(
  process.env.DB_PASSWORD ??
    process.env.POSTGRES_PASSWORD ??
    process.env.PGPASSWORD ??
    "postgres",
);
const dbName =
  process.env.DB_NAME ??
  process.env.POSTGRES_DB ??
  process.env.PGDATABASE ??
  "app";
const isLocalDbHost = ["localhost", "127.0.0.1", "::1"].includes(dbHost);
const useSsl = process.env.DB_SSL
  ? process.env.DB_SSL === "true"
  : !isLocalDbHost;

export const db = new Pool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});
