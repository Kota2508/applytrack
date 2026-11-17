import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');
const sample = [
  ['Northstar Labs','Backend Engineer','Hyderabad','interview','2026-11-12','Technical round scheduled'],
  ['RiverPay','Software Engineer II','Bengaluru','applied','2026-11-10','Payments platform role'],
  ['CloudKite','Full Stack Developer','Pune','screening','2026-11-08','Recruiter screen completed'],
  ['Aster Systems','Java Developer','Chennai','saved','2026-11-15','Review role requirements'],
  ['PixelRoute','Platform Engineer','Remote, India','offer','2026-11-04','Offer discussion in progress']
];

export function createDatabase(dbPath = process.env.DB_PATH || './data/applytrack.sqlite') {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(schema);
  if (db.prepare('SELECT COUNT(*) AS count FROM applications').get().count === 0) {
    const insert = db.prepare(`INSERT INTO applications
      (id, company, role, job_url, location, status, applied_at, notes, version, created_at, updated_at)
      VALUES (?, ?, ?, '', ?, ?, ?, ?, 1, ?, ?)`);
    const event = db.prepare(`INSERT INTO activity (id, application_id, event_type, from_status, to_status, details, created_at)
      VALUES (?, ?, 'created', NULL, ?, 'Seed application', ?)`);
    const stamp = new Date().toISOString();
    for (const [company, role, location, status, appliedAt, notes] of sample) {
      const id = randomUUID();
      insert.run(id, company, role, location, status, appliedAt, notes, stamp, stamp);
      event.run(randomUUID(), id, status, stamp);
    }
  }
  return db;
}
