import { db } from '../api/lambda_hono/src/db'
import { QueryResultRow } from 'pg'

export async function findOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await db.query<T>(sql, params)
  return result.rows[0] ?? null
}

export async function findMany<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query<T>(sql, params)
  return result.rows
}

export async function insert<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T> {
  const result = await db.query<T>(sql, params)
  return result.rows[0]
}
