/**
 * DARKRAIDER STUDIO - preview admin authentication (Step 4C).
 * Vercel Node.js Function: GET session, POST login, DELETE logout.
 * IMPORTANT: Each future write/upload endpoint must independently verify the
 * signed admin cookie on the server. Frontend login gating is not authorization.
 * Requires a random, >=32-character PORTFOLIO_ADMIN_SECRET in Vercel Preview.
 */
'use strict';

const crypto = require('node:crypto');
const COOKIE_NAME = '__Host-darkraider_admin';
const SESSION_SECONDS = 60 * 60 * 2; // 2 hours
const MAX_BODY_BYTES = 4096;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 8;
// Lightweight best-effort preview throttle, NOT a distributed rate limiter.
// Production publishing will need persistent rate limiting / Vercel WAF protection.
const recentFailures = new Map();

function reply(res, status, json, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(json));
}

function getSecret() {
  const value = process.env.PORTFOLIO_ADMIN_SECRET;
  return typeof value === 'string' && value.length >= 32 ? value : null;
}

function sameOrigin(req) {
  const host = String(req.headers.host || '').trim();
  const origin = String(req.headers.origin || '').trim();
  if (!host || !origin) return false;
  // All Vercel Preview endpoints are HTTPS. Permit localhost for local development.
  const scheme = /^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/.test(host) ? 'http' : 'https';
  return origin === `${scheme}://${host}`;
}

function getIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.socket?.remoteAddress || 'unknown').slice(0, 100);
}

function lockedOut(ip) {
  const state = recentFailures.get(ip);
  if (!state) return false;
  if (Date.now() - state.since > WINDOW_MS) {
    recentFailures.delete(ip);
    return false;
  }
  return state.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(ip) {
  const now = Date.now();
  const current = recentFailures.get(ip);
  if (!current || now - current.since > WINDOW_MS) {
    recentFailures.set(ip, { since: now, count: 1 });
  } else {
    current.count += 1;
  }
  // Limit memory usage in long-lived runtimes. In serverless this state is ephemeral.
  if (recentFailures.size > 1000) recentFailures.clear();
}

function passwordMatches(candidate, expected) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 512) return false;
  const a = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function signingKey(secret) {
  // Domain separation: the cookie key is not the literal admin password.
  return crypto.createHmac('sha256', secret)
    .update('darkraider-studio/session/v1', 'utf8').digest();
}

function makeToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    iat: now,
    exp: now + SESSION_SECONDS,
    n: crypto.randomBytes(16).toString('base64url')
  })).toString('base64url');
  const mac = crypto.createHmac('sha256', signingKey(secret))
    .update(payload, 'utf8').digest('base64url');
  return `${payload}.${mac}`;
}

function tokenValid(raw, secret) {
  if (typeof raw !== 'string' || raw.length > 1000) return false;
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const expected = crypto.createHmac('sha256', signingKey(secret))
    .update(parts[0], 'utf8').digest();
  let received;
  try { received = Buffer.from(parts[1], 'base64url'); } catch { return false; }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return false;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  return payload?.v === 1 && Number.isInteger(payload.iat) &&
    Number.isInteger(payload.exp) && typeof payload.n === 'string' &&
    payload.n.length >= 12 && payload.iat <= now + 60 &&
    payload.exp > now && payload.exp - payload.iat === SESSION_SECONDS;
}

function cookieValue(req) {
  const raw = String(req.headers.cookie || '');
  const match = raw.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + '='));
  return match ? match.slice(COOKIE_NAME.length + 1) : '';
}

function sessionIsValid(req, secret) {
  return tokenValid(cookieValue(req), secret);
}

function loginCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function logoutCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

async function handle(req, res) {
  const secret = getSecret();
  if (!secret) {
    return reply(res, 503, {
      authenticated: false,
      error: 'Admin authentication is not configured for this deployment. Check Preview environment variables and redeploy.'
    });
  }

  if (req.method === 'GET') {
    const authenticated = sessionIsValid(req, secret);
    return reply(res, authenticated ? 200 : 401, { authenticated });
  }

  if (req.method === 'POST') {
    if (!sameOrigin(req)) return reply(res, 403, { error: 'Request origin was rejected.' });
    const ip = getIp(req);
    if (lockedOut(ip)) {
      return reply(res, 429, { error: 'Too many attempts. Try again later.' }, { 'Retry-After': '900' });
    }
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return reply(res, 415, { error: 'Expected JSON.' });
    }
    const size = Number(req.headers['content-length'] || 0);
    if (!Number.isFinite(size) || size > MAX_BODY_BYTES) {
      return reply(res, 413, { error: 'Request too large.' });
    }
    let body;
    try {
      body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
    } catch {
      return reply(res, 400, { error: 'Invalid JSON.' });
    }
    if (!body || !passwordMatches(body.password, secret)) {
      recordFailure(ip);
      return reply(res, 401, { error: 'Incorrect admin code.' });
    }
    recentFailures.delete(ip);
    res.setHeader('Set-Cookie', loginCookie(makeToken(secret)));
    return reply(res, 200, { authenticated: true, expiresIn: SESSION_SECONDS });
  }

  if (req.method === 'DELETE') {
    if (!sameOrigin(req)) return reply(res, 403, { error: 'Request origin was rejected.' });
    res.setHeader('Set-Cookie', logoutCookie());
    return reply(res, 200, { authenticated: false });
  }

  return reply(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST, DELETE' });
}

module.exports = handle;
