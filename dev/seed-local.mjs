// Creates a CUFTM-shaped `users` table with three test accounts in a LOCAL
// database, so the admin panel can be tried without production data.
// Never run this against the real database.
import { getSql, closeSql } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing: DATABASE_URL is not a local database.');
  process.exit(1);
}

const sql = await getSql();
await sql`CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY, nickname TEXT NOT NULL DEFAULT '', sheet_name TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '', access TEXT NOT NULL DEFAULT 'editor',
  department TEXT, is_head BOOLEAN NOT NULL DEFAULT false, avatar TEXT, password_hash TEXT, password_salt TEXT,
  reset_allowed BOOLEAN NOT NULL DEFAULT false, reset_allowed_by TEXT, lang TEXT NOT NULL DEFAULT 'th',
  active BOOLEAN NOT NULL DEFAULT true, suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;

const people = [
  ['test-admin', 'admin', 'Test Admin'],
  ['test-coadmin', 'coadmin', 'Test Co-Admin'],
  ['test-editor', 'editor', 'Test Editor'],
];
for (const [username, access, name] of people) {
  const { hash, salt } = await hashPassword('fair2027pw');
  await sql`INSERT INTO users (username, display_name, access, password_hash, password_salt)
            VALUES (${username}, ${name}, ${access}, ${hash}, ${salt})
            ON CONFLICT (username) DO UPDATE SET access = EXCLUDED.access,
              password_hash = EXCLUDED.password_hash, password_salt = EXCLUDED.password_salt,
              suspended = false, active = true, reset_allowed = false`;
}
console.log('Local test users ready (password fair2027pw):', people.map((p) => p[0]).join(', '));
await closeSql();
