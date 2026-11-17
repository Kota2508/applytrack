import { randomUUID } from 'node:crypto';
import { HttpError, nowIso } from './http.js';

export const STATUSES = ['saved','applied','screening','interview','offer','accepted','rejected','withdrawn'];
const TRANSITIONS = {
  saved: ['applied','withdrawn'],
  applied: ['screening','rejected','withdrawn'],
  screening: ['interview','rejected','withdrawn'],
  interview: ['offer','rejected','withdrawn'],
  offer: ['accepted','rejected','withdrawn'],
  accepted: [], rejected: [], withdrawn: []
};

function mapApplication(row) {
  if (!row) return null;
  return { id: row.id, company: row.company, role: row.role, jobUrl: row.job_url,
    location: row.location, status: row.status, appliedAt: row.applied_at,
    notes: row.notes, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}
function requiredString(value, field, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new HttpError(422, `${field} must be a non-empty string of at most ${max} characters`);
  return value.trim();
}
function optionalString(value, field, max = 500) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max) throw new HttpError(422, `${field} must be at most ${max} characters`);
  return value.trim();
}

export function listApplications(db, params) {
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get('limit') || '20', 10) || 20));
  const where = []; const values = [];
  const status = params.get('status');
  if (status) {
    if (!STATUSES.includes(status)) throw new HttpError(422, 'Unknown status filter');
    where.push('status = ?'); values.push(status);
  }
  const search = params.get('q')?.trim();
  if (search) { where.push('(company LIKE ? OR role LIKE ? OR location LIKE ?)'); values.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM applications ${clause}`).get(...values).count;
  const rows = db.prepare(`SELECT * FROM applications ${clause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...values, limit, (page - 1) * limit);
  return { items: rows.map(mapApplication), page, limit, total, pages: Math.ceil(total / limit) };
}

export function getApplication(db, id) {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Application not found');
  return mapApplication(row);
}

export function createApplication(db, input) {
  const company = requiredString(input.company, 'company');
  const role = requiredString(input.role, 'role');
  const location = optionalString(input.location ?? '', 'location', 120) ?? '';
  const jobUrl = optionalString(input.jobUrl ?? '', 'jobUrl', 500) ?? '';
  const notes = optionalString(input.notes ?? '', 'notes', 2000) ?? '';
  const status = input.status ?? 'saved';
  if (!STATUSES.includes(status)) throw new HttpError(422, 'Invalid application status');
  const appliedAt = input.appliedAt ?? new Date().toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appliedAt) || Number.isNaN(Date.parse(`${appliedAt}T00:00:00Z`)))
    throw new HttpError(422, 'appliedAt must use YYYY-MM-DD');
  const id = randomUUID(); const stamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO applications (id,company,role,job_url,location,status,applied_at,notes,version,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,?,?)`).run(id,company,role,jobUrl,location,status,appliedAt,notes,stamp,stamp);
    db.prepare(`INSERT INTO activity (id,application_id,event_type,to_status,details,created_at) VALUES (?,?, 'created', ?, 'Application created', ?)`)
      .run(randomUUID(),id,status,stamp);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getApplication(db, id);
}

export function updateApplication(db, id, input) {
  const current = getApplication(db, id);
  if (!Number.isInteger(input.version)) throw new HttpError(428, 'version is required for updates');
  if (input.version !== current.version) throw new HttpError(409, 'Application was changed by another request; refresh and retry');
  const fields = {
    company: input.company === undefined ? current.company : requiredString(input.company,'company'),
    role: input.role === undefined ? current.role : requiredString(input.role,'role'),
    location: optionalString(input.location,'location',120) ?? current.location,
    jobUrl: optionalString(input.jobUrl,'jobUrl',500) ?? current.jobUrl,
    notes: optionalString(input.notes,'notes',2000) ?? current.notes
  };
  const stamp = nowIso();
  const result = db.prepare(`UPDATE applications SET company=?, role=?, location=?, job_url=?, notes=?, version=version+1, updated_at=?
    WHERE id=? AND version=?`).run(fields.company,fields.role,fields.location,fields.jobUrl,fields.notes,stamp,id,input.version);
  if (result.changes !== 1) throw new HttpError(409, 'Application version conflict');
  db.prepare(`INSERT INTO activity (id,application_id,event_type,details,created_at) VALUES (?,?, 'updated', 'Application details updated', ?)`)
    .run(randomUUID(),id,stamp);
  return getApplication(db,id);
}

export function transitionApplication(db, id, input) {
  const target = input.status;
  if (!STATUSES.includes(target)) throw new HttpError(422, 'Invalid application status');
  const details = optionalString(input.details ?? '', 'details', 500) ?? '';
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
    if (!current) throw new HttpError(404, 'Application not found');
    if (!TRANSITIONS[current.status].includes(target))
      throw new HttpError(409, `Transition ${current.status} → ${target} is not allowed`, { allowed: TRANSITIONS[current.status] });
    const stamp = nowIso();
    db.prepare('UPDATE applications SET status=?, version=version+1, updated_at=? WHERE id=?').run(target,stamp,id);
    db.prepare(`INSERT INTO activity (id,application_id,event_type,from_status,to_status,details,created_at)
      VALUES (?,?,'status_changed',?,?,?,?)`).run(randomUUID(),id,current.status,target,details,stamp);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getApplication(db,id);
}

export function applicationActivity(db, id) {
  getApplication(db,id);
  return db.prepare(`SELECT id, event_type AS eventType, from_status AS fromStatus, to_status AS toStatus,
    details, created_at AS createdAt FROM activity WHERE application_id=? ORDER BY created_at DESC`).all(id);
}

export function summary(db) {
  const rows = db.prepare('SELECT status, COUNT(*) AS count FROM applications GROUP BY status').all();
  const counts = Object.fromEntries(STATUSES.map(s => [s,0]));
  for (const row of rows) counts[row.status] = row.count;
  return { total: Object.values(counts).reduce((a,b)=>a+b,0), counts };
}
