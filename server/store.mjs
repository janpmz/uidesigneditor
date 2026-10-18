import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

export function openStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS projects (
      space_id TEXT NOT NULL REFERENCES spaces(id), id TEXT NOT NULL, name TEXT NOT NULL,
      version INTEGER NOT NULL, layout TEXT, deleted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (space_id, id));
    CREATE TABLE IF NOT EXISTS pictures (
      space_id TEXT NOT NULL REFERENCES spaces(id), id TEXT NOT NULL, src TEXT NOT NULL,
      PRIMARY KEY (space_id, id));`);
  return {
    close: () => db.close(),
    createSpace() {
      const spaceId = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO spaces VALUES (?)').run(spaceId);
      return { spaceId };
    },
    hasSpace: id => Boolean(db.prepare('SELECT id FROM spaces WHERE id=?').get(id)),
    list: spaceId => db.prepare('SELECT id, name, version, deleted FROM projects WHERE space_id=? ORDER BY rowid').all(spaceId),
    get(spaceId, id) {
      const row = db.prepare('SELECT id, name, version, layout FROM projects WHERE space_id=? AND id=? AND deleted=0').get(spaceId, id);
      if (!row) throw failure(404, 'Project not found.');
      return { ...row, layout: JSON.parse(row.layout) };
    },
    save(spaceId, id, { name, layout, version }) {
      if (!/^[-a-zA-Z0-9]{1,200}$/.test(id) || typeof name !== 'string' || !name.trim() || name.length > 200 || !Number.isSafeInteger(version) || version < 0) throw failure(400, 'Invalid project.');
      validateLayout(layout, pictureId => db.prepare('SELECT id FROM pictures WHERE space_id=? AND id=?').get(spaceId, pictureId));
      const previous = db.prepare('SELECT version, deleted FROM projects WHERE space_id=? AND id=?').get(spaceId, id);
      if (previous?.deleted || version !== (previous?.version || 0)) throw failure(409, 'A newer version exists. Reload or save as a copy.');
      const next = version + 1;
      // This check and write run without yielding on one server process.
      db.prepare(`INSERT INTO projects (space_id,id,name,version,layout) VALUES (?,?,?,?,?)
        ON CONFLICT(space_id,id) DO UPDATE SET name=excluded.name,version=excluded.version,layout=excluded.layout`).run(spaceId, id, name.trim(), next, JSON.stringify(layout));
      return { projectId: id, version: next };
    },
    remove(spaceId, id, version) {
      if (!Number.isSafeInteger(version) || version < 1) throw failure(400, 'Invalid project version.');
      const result = db.prepare('UPDATE projects SET deleted=1,layout=NULL,version=version+1 WHERE space_id=? AND id=? AND version=? AND deleted=0').run(spaceId, id, version);
      if (!result.changes) throw failure(409, 'A newer version exists. Reload before deleting.');
      return { projectId: id, version: version + 1, deleted: true };
    },
    putPicture(spaceId, src) {
      if (typeof src !== 'string' || src.length > 40_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(src) || !Buffer.from(src.split(',')[1], 'base64').subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw failure(400, 'Use a PNG picture.');
      const id = createHash('sha256').update(src).digest('hex');
      db.prepare('INSERT OR IGNORE INTO pictures VALUES (?,?,?)').run(spaceId, id, src);
      return { id };
    },
    getPicture(spaceId, id) {
      const row = db.prepare('SELECT src FROM pictures WHERE space_id=? AND id=?').get(spaceId, id);
      if (!row) throw failure(404, 'Picture not found.');
      return row;
    },
  };
}

function validateLayout(layout, hasPicture, depth = 0) {
  const canvas = layout?.canvas;
  if (depth > 6 || layout?.version !== 1 || !canvas || ![canvas.width, canvas.height].every(n => Number.isFinite(n) && n > 0 && n <= 16000) || canvas.width * canvas.height > 24_000_000 || !Array.isArray(layout.items) || layout.items.length > 5000) throw failure(400, 'Invalid design.');
  const ids = new Set();
  for (const item of layout.items) {
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id) || !['label','icon','shape','reading','tab','button','textbox','image'].includes(item.kind) || ![item.x,item.y,item.w,item.h].every(Number.isFinite) || item.w <= 0 || item.h <= 0) throw failure(400, 'Invalid design item.');
    ids.add(item.id);
    if (item.kind === 'image' && (typeof item.src !== 'string' || !/^picture:[a-f0-9]{64}$/.test(item.src) || !hasPicture(item.src.slice(8)))) throw failure(400, 'Picture not found in this Space.');
    if (item.imageContents) validateLayout(item.imageContents, hasPicture, depth + 1);
  }
}

export function failure(status, message) { return Object.assign(new Error(message), { status }); }
