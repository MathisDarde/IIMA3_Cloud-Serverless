import { Hono } from "hono";
import { db } from "../db";

const backups = new Hono();

backups.get("/", async (c) => {
  const result = await db.query(
    "SELECT id, s3_key, size_bytes, status, created_at FROM backups ORDER BY created_at DESC",
  );
  return c.json({ backups: result.rows });
});

export default backups;
