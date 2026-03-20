import { Hono } from "hono";
import { db } from "../db";

const stats = new Hono();

stats.get("/", async (c) => {
  const [u, t, p, tk] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS count FROM users"),
    db.query("SELECT COUNT(*)::int AS count FROM teams"),
    db.query("SELECT COUNT(*)::int AS count FROM projects"),
    db.query("SELECT COUNT(*)::int AS count FROM tasks"),
  ]);
  return c.json({
    users: u.rows[0].count,
    teams: t.rows[0].count,
    projects: p.rows[0].count,
    tasks: tk.rows[0].count,
  });
});

export default stats;
