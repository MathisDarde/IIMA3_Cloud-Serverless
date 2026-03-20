import { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser } from "../services/cognito";
import { createUploadPresignedPost, createDownloadPresignedUrl } from "../services/s3";
import { randomUUID } from "node:crypto";

type CognitoAttr = { Name?: string; Value?: string };

let tasksSchemaReady = false;

async function ensureTasksSchema() {
  if (tasksSchemaReady) return;

  await db.query(
    `CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'todo',
      assigned_to VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
  );

  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)",
  );

  tasksSchemaReady = true;
}

let assetsSchemaReady = false;

async function ensureAssetsSchema() {
  if (assetsSchemaReady) return;
  await db.query(
    `CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      filename VARCHAR(255) NOT NULL,
      s3_key VARCHAR(500) NOT NULL,
      size_bytes INTEGER,
      content_type VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_assets_task_id ON assets(task_id)",
  );
  assetsSchemaReady = true;
}

function getAccessTokenFromHeader(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return authorizationHeader.slice("Bearer ".length).trim();
}

function pickAttribute(attributes: CognitoAttr[] | undefined, name: string) {
  return attributes?.find((attr) => attr.Name === name)?.Value ?? null;
}

async function resolveCurrentUserId(accessToken: string): Promise<number> {
  const cognitoUser = await getCurrentUser(accessToken);
  const sub = pickAttribute(cognitoUser.UserAttributes, "sub");
  if (!sub) throw new Error("Invalid Cognito user: missing sub");

  const existing = await db.query(
    "SELECT id FROM users WHERE cognito_sub = $1",
    [sub],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0].id as number;
  }

  const inserted = await db.query(
    `INSERT INTO users (cognito_sub, role)
     VALUES ($1, 'user')
     ON CONFLICT (cognito_sub) DO NOTHING
     RETURNING id`,
    [sub],
  );
  if (inserted.rowCount && inserted.rowCount > 0) {
    return inserted.rows[0].id as number;
  }

  const fallback = await db.query(
    "SELECT id FROM users WHERE cognito_sub = $1",
    [sub],
  );
  if (!fallback.rowCount) throw new Error("User not found in database");
  return fallback.rows[0].id as number;
}

async function requireCurrentUserId(c: any) {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) {
    return { error: c.json({ error: "Missing Bearer token" }, 401), userId: null };
  }

  try {
    await ensureTasksSchema();
    const userId = await resolveCurrentUserId(accessToken);
    return { error: null, userId };
  } catch (error) {
    console.error("Unable to resolve current user for tasks", error);
    return {
      error: c.json(
        {
          error: "Unable to use tasks service. Check database connectivity.",
          details:
            process.env.NODE_ENV === "production"
              ? undefined
              : String((error as Error)?.message),
        },
        500,
      ),
      userId: null,
    };
  }
}

async function requireProjectMembership(
  userId: number,
  projectId: number,
): Promise<boolean> {
  const result = await db.query(
    `SELECT p.team_id
     FROM projects p
     JOIN team_members tm ON tm.team_id = p.team_id
     WHERE p.id = $1 AND tm.user_id = $2`,
    [projectId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// ─── Router mounted at /projects ──────────────────────────────────────────────

export const projectTasks = new Hono();

// POST /projects/:projectId/tasks
projectTasks.post("/:projectId/tasks", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const projectId = Number(c.req.param("projectId"));
  if (!Number.isFinite(projectId)) return c.json({ error: "Invalid project id" }, 400);

  const allowed = await requireProjectMembership(userId, projectId);
  if (!allowed) return c.json({ error: "Forbidden: you are not a member of this project's team" }, 403);

  const { name, description } = await c.req.json();
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) return c.json({ error: "Task name is required" }, 400);

  const result = await db.query(
    `INSERT INTO tasks (project_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, project_id, name, description, status, assigned_to, created_at, updated_at`,
    [projectId, normalizedName, description ?? null],
  );

  return c.json({ task: result.rows[0] }, 201);
});

// GET /projects/:projectId/tasks
projectTasks.get("/:projectId/tasks", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const projectId = Number(c.req.param("projectId"));
  if (!Number.isFinite(projectId)) return c.json({ error: "Invalid project id" }, 400);

  const allowed = await requireProjectMembership(userId, projectId);
  if (!allowed) return c.json({ error: "Forbidden: you are not a member of this project's team" }, 403);

  const result = await db.query(
    `SELECT id, project_id, name, description, status, assigned_to, created_at, updated_at
     FROM tasks
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId],
  );

  return c.json({ tasks: result.rows });
});

// ─── Router mounted at /tasks ─────────────────────────────────────────────────

export const tasks = new Hono();

// GET /tasks/:taskId
tasks.get("/:taskId", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) return c.json({ error: "Invalid task id" }, 400);

  const taskResult = await db.query(
    "SELECT id, project_id, name, description, status, assigned_to, created_at, updated_at FROM tasks WHERE id = $1",
    [taskId],
  );

  if (!taskResult.rowCount) return c.json({ error: "Task not found" }, 404);

  const task = taskResult.rows[0];
  const allowed = await requireProjectMembership(userId, task.project_id);
  if (!allowed) return c.json({ error: "Forbidden" }, 403);

  return c.json({ task });
});

// PATCH /tasks/:taskId
tasks.patch("/:taskId", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) return c.json({ error: "Invalid task id" }, 400);

  const taskResult = await db.query(
    "SELECT id, project_id FROM tasks WHERE id = $1",
    [taskId],
  );
  if (!taskResult.rowCount) return c.json({ error: "Task not found" }, 404);

  const task = taskResult.rows[0];
  const allowed = await requireProjectMembership(userId, task.project_id);
  if (!allowed) return c.json({ error: "Forbidden" }, 403);

  const { name, description } = await c.req.json();
  if (name == null && description == null) return c.json({ error: "Nothing to update" }, 400);

  const result = await db.query(
    `UPDATE tasks
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, project_id, name, description, status, assigned_to, created_at, updated_at`,
    [name ?? null, description ?? null, taskId],
  );

  return c.json({ task: result.rows[0] });
});

// DELETE /tasks/:taskId
tasks.delete("/:taskId", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) return c.json({ error: "Invalid task id" }, 400);

  const taskResult = await db.query(
    "SELECT id, project_id FROM tasks WHERE id = $1",
    [taskId],
  );
  if (!taskResult.rowCount) return c.json({ error: "Task not found" }, 404);

  const task = taskResult.rows[0];
  const allowed = await requireProjectMembership(userId, task.project_id);
  if (!allowed) return c.json({ error: "Forbidden" }, 403);

  await db.query("DELETE FROM tasks WHERE id = $1", [taskId]);

  return c.json({ message: "Task deleted" });
});

// PATCH /tasks/:taskId/assign
tasks.patch("/:taskId/assign", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) return c.json({ error: "Invalid task id" }, 400);

  const taskResult = await db.query(
    "SELECT id, project_id FROM tasks WHERE id = $1",
    [taskId],
  );
  if (!taskResult.rowCount) return c.json({ error: "Task not found" }, 404);

  const task = taskResult.rows[0];
  const allowed = await requireProjectMembership(userId, task.project_id);
  if (!allowed) return c.json({ error: "Forbidden" }, 403);

  const { cognito_sub } = await c.req.json();

  const result = await db.query(
    `UPDATE tasks
     SET assigned_to = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, project_id, name, description, status, assigned_to, created_at, updated_at`,
    [cognito_sub ?? null, taskId],
  );

  return c.json({ task: result.rows[0] });
});

// PATCH /tasks/:taskId/status
tasks.patch("/:taskId/status", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) return c.json({ error: "Invalid task id" }, 400);

  const taskResult = await db.query(
    "SELECT id, project_id FROM tasks WHERE id = $1",
    [taskId],
  );
  if (!taskResult.rowCount) return c.json({ error: "Task not found" }, 404);

  const task = taskResult.rows[0];
  const allowed = await requireProjectMembership(userId, task.project_id);
  if (!allowed) return c.json({ error: "Forbidden" }, 403);

  const { status } = await c.req.json();
  const validStatuses = ["todo", "in_progress", "done"];
  if (!validStatuses.includes(status)) {
    return c.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);
  }

  const result = await db.query(
    `UPDATE tasks
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, project_id, name, description, status, assigned_to, created_at, updated_at`,
    [status, taskId],
  );

  return c.json({ task: result.rows[0] });
});

// POST /tasks/:taskId/assets — upload asset linked to a task
tasks.post("/:taskId/assets", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) return c.json({ error: "Invalid task id" }, 400);

  const taskResult = await db.query(
    "SELECT id, project_id FROM tasks WHERE id = $1",
    [taskId],
  );
  if (!taskResult.rowCount) return c.json({ error: "Task not found" }, 404);

  const task = taskResult.rows[0];
  const allowed = await requireProjectMembership(userId, task.project_id);
  if (!allowed) return c.json({ error: "Forbidden" }, 403);

  await ensureAssetsSchema();

  const { filename, content_type, size_bytes } = await c.req.json();
  if (!filename || !content_type) {
    return c.json({ error: "filename and content_type are required" }, 400);
  }

  const ext = filename.split(".").pop() ?? "bin";
  const s3Key = `tasks/${taskId}/${randomUUID()}.${ext}`;

  const presigned = await createUploadPresignedPost(s3Key, content_type, size_bytes ?? 10 * 1024 * 1024);

  const result = await db.query(
    `INSERT INTO assets (task_id, uploaded_by, filename, s3_key, size_bytes, content_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, task_id, filename, s3_key, size_bytes, content_type, created_at`,
    [taskId, userId, filename, s3Key, size_bytes ?? null, content_type],
  );

  return c.json({
    asset: result.rows[0],
    presign_url: presigned.url,
    presign_fields: presigned.fields,
  }, 201);
});

// GET /tasks/:taskId/assets
tasks.get("/:taskId/assets", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const taskId = Number(c.req.param("taskId"));
  if (!Number.isFinite(taskId)) return c.json({ error: "Invalid task id" }, 400);

  const taskResult = await db.query(
    "SELECT id, project_id FROM tasks WHERE id = $1",
    [taskId],
  );
  if (!taskResult.rowCount) return c.json({ error: "Task not found" }, 404);

  const task = taskResult.rows[0];
  const allowed = await requireProjectMembership(userId, task.project_id);
  if (!allowed) return c.json({ error: "Forbidden" }, 403);

  await ensureAssetsSchema();

  const result = await db.query(
    `SELECT id, task_id, filename, s3_key, size_bytes, content_type, created_at
     FROM assets WHERE task_id = $1 ORDER BY created_at DESC`,
    [taskId],
  );

  const assetsWithUrls = await Promise.all(
    result.rows.map(async (asset) => ({
      ...asset,
      download_url: await createDownloadPresignedUrl(asset.s3_key),
    })),
  );

  return c.json({ assets: assetsWithUrls });
});

export default tasks;
