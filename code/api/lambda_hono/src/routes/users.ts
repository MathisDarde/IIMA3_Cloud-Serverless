import { Hono } from "hono";
import { db } from "../db";

const users = new Hono();

users.get("/", async (c) => {
  const result = await db.query(
    "SELECT id, email, role, created_at FROM users",
  );
  return c.json({ users: result.rows });
});

users.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.query(
    "SELECT id, email, role, created_at FROM users WHERE id = $1",
    [id],
  );
  return c.json({ user: result.rows[0] });
});

users.post("/", async (c) => {
  const { email, password, role } = await c.req.json();
  const result = await db.query(
    "INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at",
    [email, password, role ?? "user"],
  );
  return c.json({ user: result.rows[0] }, 201);
});

export default users;
