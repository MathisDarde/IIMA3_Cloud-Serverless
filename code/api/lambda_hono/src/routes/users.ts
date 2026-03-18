import { Hono } from "hono";
import { db } from "../db";
import { register } from "../services/cognito";

const users = new Hono();

users.get("/", async (c) => {
  const result = await db.query(
    "SELECT id, cognito_sub, role, created_at FROM users",
  );
  return c.json({ users: result.rows });
});

users.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.query(
    "SELECT id, cognito_sub, role, created_at FROM users WHERE id = $1",
    [id],
  );
  return c.json({ user: result.rows[0] });
});

users.post("/", async (c) => {
  const { email, password, role, first_name, last_name } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const cognitoSub = await register(email, password, {
    given_name: first_name,
    family_name: last_name,
  });

  const result = await db.query(
    `INSERT INTO users (cognito_sub, role)
     VALUES ($1, $2)
     RETURNING id, cognito_sub, role, created_at`,
    [cognitoSub, role ?? "user"],
  );

  return c.json({ user: result.rows[0] }, 201);
});

export default users;
