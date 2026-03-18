import "./env";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import users from "./routes/users";
import auth from "./routes/auth";
import teams from "./routes/teams";

export const app = new Hono();

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      const allowedOrigins = [
        process.env.USER_FRONTEND_ORIGIN,
        process.env.ADMIN_FRONTEND_ORIGIN,
        "http://localhost:5173",
        "http://localhost:5174",
      ].filter(Boolean);
      return allowedOrigins.includes(origin) ? origin : "null";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.get("/", (c) => c.json({ message: "API is running" }));
app.route("/users", users);
app.route("/auth", auth);
app.route("/teams", teams);

export const handler = handle(app);
