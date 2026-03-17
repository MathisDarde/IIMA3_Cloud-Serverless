import { db } from '../db'
import { QueryResult } from 'pg'

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return db.query<T>(sql, params)
}

export async function findOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await db.query<T>(sql, params)
  return result.rows[0] ?? null
}

export async function findMany<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query<T>(sql, params)
  return result.rows
}

export async function insert<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T> {
  const result = await db.query<T>(sql, params)
  return result.rows[0]
}
