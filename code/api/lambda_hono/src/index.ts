import "./env";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import users from "./routes/users";
import auth from "./routes/auth";
import teams from "./routes/teams";
import projects from "./routes/projects";
import tasks from "./routes/tasks";

export const app = new Hono();

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

app.use(
  "*",
  cors({
    origin: () => {
      return "*";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.get("/", (c) => c.json({ message: "API is running" }));
app.route("/users", users);
app.route("/auth", auth);
app.route("/teams", teams);
app.route("/projects", projects);
app.route("/projects", tasks);

export const handler = handle(app);
