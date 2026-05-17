import Database from 'better-sqlite3';
import crypto from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'New chat',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content     TEXT NOT NULL,
  meta        TEXT,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
`;

export function openDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function createSession(db) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, 'New chat', ?, ?)`
  ).run(id, now, now);
  return getSession(db, id);
}

export function listSessions(db) {
  return db
    .prepare(`SELECT id, title, updated_at FROM sessions ORDER BY updated_at DESC`)
    .all();
}

export function getSession(db, id) {
  return db
    .prepare(`SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?`)
    .get(id);
}

export function deleteSession(db, id) {
  const info = db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  return info.changes > 0;
}

export function getMessages(db, sessionId) {
  const rows = db
    .prepare(
      `SELECT id, role, content, meta, created_at FROM messages WHERE session_id = ? ORDER BY id ASC`
    )
    .all(sessionId);
  return rows.map((r) => ({
    ...r,
    meta: r.meta ? safeJsonParse(r.meta) : null
  }));
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function deriveTitle(text) {
  const trimmed = String(text || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'New chat';
  return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
}

export function addMessage(db, { sessionId, role, content, meta }) {
  const now = Date.now();
  const metaStr = meta == null ? null : JSON.stringify(meta);
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO messages (session_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?)`
      )
      .run(sessionId, role, content, metaStr, now);

    // Update session updated_at; if New chat and first user message, also set title.
    const session = db
      .prepare(`SELECT title FROM sessions WHERE id = ?`)
      .get(sessionId);
    if (!session) {
      throw new Error('Session not found for addMessage: ' + sessionId);
    }
    if (role === 'user' && session.title === 'New chat') {
      db.prepare(
        `UPDATE sessions SET updated_at = ?, title = ? WHERE id = ?`
      ).run(now, deriveTitle(content), sessionId);
    } else {
      db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(
        now,
        sessionId
      );
    }

    return info.lastInsertRowid;
  });

  const id = tx();
  return {
    id: Number(id),
    session_id: sessionId,
    role,
    content,
    meta: meta ?? null,
    created_at: now
  };
}
