import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

/**
 * Sign-in for the website's editors.
 *
 * There is no separate account list. A person signs in with their CUFTM
 * (task.chulafair.com) username and password, and is let in only when CUFTM
 * says their access is Admin or Co-Admin and the account is active and not
 * suspended. Changing someone's access in CUFTM changes it here on their very
 * next request, because every request re-reads `users`.
 *
 * Passwords are verified exactly the way CUFTM stores them (salted scrypt,
 * 64-byte key). This site never writes a password, never touches CUFTM's
 * `sessions` table, and keeps its own cookie, `site_session`.
 */

const SCRYPT_KEYLEN = 64;
const SESSION_DAYS = 14;
const MAX_FAILS = 8;          // per username …
const FAIL_WINDOW_MIN = 15;   // … within this many minutes

export const EDITOR_ACCESS = ['admin', 'coadmin'];

export async function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const derived = await scrypt(String(password), salt, SCRYPT_KEYLEN);
  const stored = Buffer.from(hash, 'hex');
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}

/** Only used by tests to create CUFTM-style users. */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return { hash: derived.toString('hex'), salt };
}

export const newToken = () => randomBytes(32).toString('hex');

export function sessionCookie(token, { clear = false } = {}) {
  return [
    `site_session=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    process.env.INSECURE_COOKIES ? null : 'Secure',
    clear ? 'Max-Age=0' : `Max-Age=${SESSION_DAYS * 86400}`,
  ].filter(Boolean).join('; ');
}

export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

const editorFrom = (u) => ({
  username: u.username,
  name: u.display_name || u.nickname || u.sheet_name || u.username,
  access: u.access,
  avatar: u.avatar || null,
});

/**
 * The signed-in editor, or null. Joins through to CUFTM's users table on every
 * call, so a demotion or suspension in CUFTM takes effect immediately.
 */
export async function currentEditor(req, sql) {
  const token = readCookie(req, 'site_session');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [u] = await sql`
    SELECT u.username, u.display_name, u.nickname, u.sheet_name, u.access, u.avatar
    FROM site_sessions s
    JOIN users u ON u.username = s.username
    WHERE s.token = ${token}
      AND s.expires_at > now()
      AND u.active = true
      AND u.suspended = false
      AND u.access IN ('admin', 'coadmin')`;
  return u ? editorFrom(u) : null;
}

/**
 * Returns { editor, token } on success or { error } with a code the admin page
 * translates. Codes are specific on purpose: this is an internal tool and a
 * clear "you are not an admin" saves a lot of confused messages.
 */
export async function signIn(sql, usernameRaw, password) {
  const username = String(usernameRaw ?? '').trim().toLowerCase();
  if (!username || !password) return { error: 'MISSING' };

  const [{ fails }] = await sql`
    SELECT count(*)::int AS fails FROM site_login_attempts
    WHERE username = ${username}
      AND at > now() - make_interval(mins => ${FAIL_WINDOW_MIN})`;
  if (fails >= MAX_FAILS) return { error: 'TOO_MANY_ATTEMPTS' };

  const [u] = await sql`
    SELECT * FROM users
    WHERE lower(username) = ${username} AND active = true AND suspended = false`;

  const fail = async (error) => {
    await sql`INSERT INTO site_login_attempts (username) VALUES (${username})`;
    return { error };
  };

  if (!u) return fail('BAD_CREDENTIALS');
  if (!u.password_hash) return { error: 'NO_PASSWORD_YET' };
  if (u.reset_allowed) return { error: 'RESET_PENDING' };
  if (!(await verifyPassword(password, u.password_hash, u.password_salt))) {
    return fail('BAD_CREDENTIALS');
  }
  // Checked after the password, so the access level is only revealed to the
  // person who actually owns the account.
  if (!EDITOR_ACCESS.includes(u.access)) return { error: 'NOT_ADMIN' };

  const token = newToken();
  await sql`
    INSERT INTO site_sessions (token, username, expires_at)
    VALUES (${token}, ${u.username}, now() + make_interval(days => ${SESSION_DAYS}))`;
  await sql`DELETE FROM site_sessions WHERE expires_at < now()`;
  await sql`DELETE FROM site_login_attempts
            WHERE username = ${username} OR at < now() - interval '1 day'`;
  return { editor: editorFrom(u), token };
}

export async function signOut(req, sql) {
  const token = readCookie(req, 'site_session');
  if (token) await sql`DELETE FROM site_sessions WHERE token = ${token}`;
}
