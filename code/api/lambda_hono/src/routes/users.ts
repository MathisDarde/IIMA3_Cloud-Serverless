import { Hono } from "hono";
import { db } from "../db";
import { register, getUserBySub } from "../services/cognito";

const users = new Hono();

function attr(attributes: { Name?: string; Value?: string }[] | undefined, name: string) {
  return attributes?.find((a) => a.Name === name)?.Value ?? null;
}

users.get("/", async (c) => {
  const result = await db.query(
    "SELECT id, cognito_sub, role, created_at FROM users",
  );
  const rows = result.rows;

  const enriched = await Promise.all(
    rows.map(async (u: { id: number; cognito_sub: string; role: string; created_at: string }) => {
      try {
        const cognitoUser = await getUserBySub(u.cognito_sub);
        const attrs = cognitoUser?.Attributes;
        return {
          ...u,
          email: attr(attrs, "email"),
          first_name: attr(attrs, "given_name"),
          last_name: attr(attrs, "family_name"),
        };
      } catch {
        return { ...u, email: null, first_name: null, last_name: null };
      }
    }),
  );

  return c.json({ users: enriched });
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
