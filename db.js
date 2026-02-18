const DB_PATH = process.env.DB_PATH || '/data/mediatorr.db';

let _db = null;

function getDb() {
  if (_db) return _db;

  const Database = require('better-sqlite3');
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS media_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      api_id_override INTEGER NOT NULL,
      api_type TEXT NOT NULL DEFAULT 'movie',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(type, name)
    )
  `);

  return _db;
}

function getOverride(type, name) {
  const db = getDb();
  return db.prepare('SELECT * FROM media_overrides WHERE type = ? AND name = ?').get(type, name) || null;
}

function setOverride(type, name, apiIdOverride, apiType) {
  const db = getDb();
  db.prepare(`
    INSERT INTO media_overrides (type, name, api_id_override, api_type, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(type, name) DO UPDATE SET
      api_id_override = excluded.api_id_override,
      api_type = excluded.api_type,
      updated_at = datetime('now')
  `).run(type, name, apiIdOverride, apiType);
}

function removeOverride(type, name) {
  const db = getDb();
  db.prepare('DELETE FROM media_overrides WHERE type = ? AND name = ?').run(type, name);
}

function close() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = {
  getOverride,
  setOverride,
  removeOverride,
  close
};
