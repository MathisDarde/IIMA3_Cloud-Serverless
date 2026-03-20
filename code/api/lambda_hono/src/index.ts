import "./env";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import users from "./routes/users";
import auth from "./routes/auth";
import me from "./routes/me";
import teams from "./routes/teams";
import invitations from "./routes/invitations";
import projects from "./routes/projects";
import { projectTasks, tasks } from "./routes/tasks";
import assets from "./routes/assets";
import backups from "./routes/backups";
import stats from "./routes/stats";

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
app.route("/me", me);
app.route("/teams", teams);
app.route("/invitations", invitations);
app.route("/projects", projects);
app.route("/projects", projectTasks);
app.route("/tasks", tasks);
app.route("/assets", assets);
app.route("/backups", backups);
app.route("/stats", stats);

export const handler = handle(app);
