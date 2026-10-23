import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDatabase(filename = process.env.DB_PATH || '.data/pairon.sqlite') {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      company TEXT NOT NULL, password_hash TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, company TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
      segment TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id), title TEXT NOT NULL, amount REAL NOT NULL,
      recurrence TEXT NOT NULL, stage TEXT NOT NULL, expected_close TEXT NOT NULL,
      notes TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id), deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      title TEXT NOT NULL, items TEXT NOT NULL, message TEXT NOT NULL, valid_until TEXT NOT NULL,
      status TEXT NOT NULL, public_token TEXT NOT NULL UNIQUE,
      accepted_at TEXT, accepted_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      title TEXT NOT NULL, due_date TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      annual_goal REAL NOT NULL DEFAULT 1000000, monthly_ticket REAL NOT NULL DEFAULT 997
    );
    CREATE INDEX IF NOT EXISTS clients_owner ON clients(user_id);
    CREATE INDEX IF NOT EXISTS deals_owner ON deals(user_id);
    CREATE INDEX IF NOT EXISTS proposals_owner ON proposals(user_id);
    CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  `);
  return db;
}

export const now = () => new Date().toISOString();
export const userJson = row => row && ({
  id: row.id, name: row.name, email: row.email, company: row.company,
  isDemo: Boolean(row.is_demo), createdAt: row.created_at,
});
export const clientJson = row => row && ({
  id: row.id, name: row.name, company: row.company, email: row.email,
  phone: row.phone, segment: row.segment, notes: row.notes,
  createdAt: row.created_at, updatedAt: row.updated_at,
});
export const dealJson = row => row && ({
  id: row.id, clientId: row.client_id, title: row.title, amount: row.amount,
  recurrence: row.recurrence, stage: row.stage, expectedClose: row.expected_close,
  notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
});
export const proposalJson = row => {
  if (!row) return undefined;
  const items = JSON.parse(row.items);
  return {
    id: row.id, clientId: row.client_id, dealId: row.deal_id, title: row.title,
    items, total: Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100,
    message: row.message, validUntil: row.valid_until, status: row.status,
    publicToken: row.public_token, acceptedAt: row.accepted_at, acceptedBy: row.accepted_by,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
};
export const taskJson = row => row && ({
  id: row.id, clientId: row.client_id, dealId: row.deal_id, title: row.title,
  dueDate: row.due_date, done: Boolean(row.done), createdAt: row.created_at, updatedAt: row.updated_at,
});
