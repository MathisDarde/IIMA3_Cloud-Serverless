CREATE TABLE IF NOT EXISTS team_invitations (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email VARCHAR(255) NOT NULL,
  invitee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_invitee_email
ON team_invitations (LOWER(invitee_email));

CREATE INDEX IF NOT EXISTS idx_team_invitations_status
ON team_invitations (status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_invitations_pending
ON team_invitations (team_id, LOWER(invitee_email))
WHERE status = 'pending';
