import "./env";
import type { ScheduledHandler } from "aws-lambda";
import { gzipSync } from "node:zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "./db";
import { requireEnv } from "./env";

type TableDef = {
  table_schema: string;
  table_name: string;
};

type ColumnDef = {
  column_name: string;
};

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (value instanceof Date) {
    return quoteLiteral(value.toISOString());
  }

  if (typeof value === "string") {
    return quoteLiteral(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "NULL";
    }
    return String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (typeof value === "object") {
    return quoteLiteral(JSON.stringify(value));
  }

  return quoteLiteral(String(value));
}

async function buildSqlDataDump(): Promise<{ sql: string; tableCount: number; rowCount: number }> {
  const tableResult = await db.query<TableDef>(
    `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `,
  );

  const lines: string[] = [];
  lines.push(`-- Backup generated at ${new Date().toISOString()}`);
  lines.push("BEGIN;");

  let totalRows = 0;

  for (const table of tableResult.rows) {
    const qualifiedName = `${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`;

    const columnResult = await db.query<ColumnDef>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `,
      [table.table_schema, table.table_name],
    );

    const columns = columnResult.rows.map((column) => column.column_name);
    if (columns.length === 0) {
      continue;
    }

    const dataResult = await db.query<Record<string, unknown>>(
      `SELECT * FROM ${qualifiedName}`,
    );

    if (dataResult.rows.length === 0) {
      continue;
    }

    totalRows += dataResult.rows.length;
    lines.push(`-- Table ${table.table_schema}.${table.table_name}`);

    const columnSql = columns.map(quoteIdent).join(", ");
    const valuesSql = dataResult.rows
      .map((row) => {
        const rowValues = columns.map((columnName) => sqlValue(row[columnName]));
        return `(${rowValues.join(", ")})`;
      })
      .join(",\n");

    lines.push(`INSERT INTO ${qualifiedName} (${columnSql}) VALUES\n${valuesSql};`);
  }

  lines.push("COMMIT;");
  lines.push("");

  return {
    sql: lines.join("\n"),
    tableCount: tableResult.rows.length,
    rowCount: totalRows,
  };
}

const region = process.env.AWS_REGION ?? "eu-west-3";
const bucket = requireEnv("S3_BACKUP_BUCKET");
const prefix = process.env.S3_BACKUP_PREFIX ?? "database/hourly";
const dbName = process.env.DB_NAME ?? "database";
const s3 = new S3Client({ region });

export const handler: ScheduledHandler = async () => {
  const { sql, tableCount, rowCount } = await buildSqlDataDump();
  const payload = gzipSync(Buffer.from(sql, "utf8"));

  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const key = `${prefix}/db-backup-${dbName}-${timestamp}.sql.gz`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: payload,
      ContentType: "application/sql",
      ContentEncoding: "gzip",
      Metadata: {
        source: "lambda-hourly-db-backup",
        dbname: dbName,
        tablecount: String(tableCount),
        rowcount: String(rowCount),
      },
    }),
  );

  console.log(
    JSON.stringify({
      message: "Database backup uploaded to S3",
      bucket,
      key,
      tableCount,
      rowCount,
      sizeBytes: payload.byteLength,
    }),
  );
};

if (require.main === module) {
  Promise.resolve(handler({} as never, {} as never, () => undefined)).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
