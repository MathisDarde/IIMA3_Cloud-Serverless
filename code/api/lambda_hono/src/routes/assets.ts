import { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser } from "../services/cognito";
import { deleteS3Object } from "../services/s3";

const assets = new Hono();

function getAccessTokenFromHeader(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return authorizationHeader.slice("Bearer ".length).trim();
}

async function requireCurrentUser(c: any) {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) return { error: c.json({ error: "Missing Bearer token" }, 401), userId: null };

  const cognitoUser = await getCurrentUser(accessToken);
  const sub = cognitoUser.UserAttributes?.find((a) => a.Name === "sub")?.Value;
  if (!sub) return { error: c.json({ error: "Invalid token" }, 401), userId: null };

  const result = await db.query("SELECT id FROM users WHERE cognito_sub = $1", [sub]);
  if (!result.rowCount) return { error: c.json({ error: "User not found" }, 401), userId: null };

  return { error: null, userId: result.rows[0].id as number };
}

// DELETE /assets/:assetId
assets.delete("/:assetId", async (c) => {
  const { error, userId } = await requireCurrentUser(c);
  if (error || !userId) return error;

  const assetId = Number(c.req.param("assetId"));
  if (!Number.isFinite(assetId)) return c.json({ error: "Invalid asset id" }, 400);

  const asset = await db.query("SELECT * FROM assets WHERE id = $1", [assetId]);
  if (!asset.rowCount) return c.json({ error: "Asset not found" }, 404);

  const { task_id, uploaded_by, s3_key } = asset.rows[0];

  // Check membership via task → project → team
  const memberCheck = await db.query(
    `SELECT 1 FROM team_members tm
     JOIN projects p ON p.team_id = tm.team_id
     JOIN tasks t ON t.project_id = p.id
     WHERE t.id = $1 AND tm.user_id = $2`,
    [task_id, userId],
  );
  if (!memberCheck.rowCount) return c.json({ error: "Forbidden" }, 403);

  if (uploaded_by !== userId) {
    const ownerCheck = await db.query(
      `SELECT 1 FROM team_members tm
       JOIN projects p ON p.team_id = tm.team_id
       JOIN tasks t ON t.project_id = p.id
       WHERE t.id = $1 AND tm.user_id = $2 AND tm.role IN ('owner', 'admin')`,
      [task_id, userId],
    );
    if (!ownerCheck.rowCount) return c.json({ error: "Forbidden: only uploader or team owner can delete" }, 403);
  }

  await deleteS3Object(s3_key);
  await db.query("DELETE FROM assets WHERE id = $1", [assetId]);

  return c.json({ message: "Asset deleted" });
});

export default assets;
