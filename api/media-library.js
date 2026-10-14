/**
 * DARKRAIDER STUDIO - managed media library (Step 4G).
 * GET /api/media-library : list generated portfolio uploads with published-reference status.
 * DELETE /api/media-library : delete ONE unused generated upload on portfolio-admin.
 *
 * Deliberately cannot delete arbitrary GitHub files, original theme assets, or
 * anything still referenced in the latest published portfolio.json.
 * Requires the server-signed admin session; uses GitHub token on the server only.
 */
'use strict';

const auth = require('./admin.js');
const REPO = 'Darkraider888/portfolio-v2';
const BRANCH = 'portfolio-admin';
const JSON_FILE = 'data/portfolio.json';
const BASE = `https://api.github.com/repos/${REPO}`;
const MAX_DELETE_REQUEST_BYTES = 2048;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PROJECT_ID = '[a-z0-9]+(?:-[a-z0-9]+)*';
const MANAGED_PATTERNS = [
  ['project-cover', new RegExp(`^assets/projects/${PROJECT_ID}/cover-${UUID}\\.(?:jpg|png|webp)$`, 'i')],
  ['project-screenshot', new RegExp(`^assets/projects/${PROJECT_ID}/screenshots/${UUID}\\.(?:jpg|png|webp)$`, 'i')],
  ['certificate', new RegExp(`^assets/certificates/certificate-${UUID}\\.(?:jpg|png|webp|pdf)$`, 'i')],
  ['profile-photo', new RegExp(`^assets/images/profile-${UUID}\\.(?:jpg|png|webp)$`, 'i')],
  ['resume', new RegExp(`^assets/files/resume-${UUID}\\.pdf$`, 'i')],
  ['skill-icon', new RegExp(`^assets/skills/icon-${UUID}\\.(?:jpg|png|webp)$`, 'i')]
];

function mediaKind(path) {
  if (typeof path !== 'string' || path.length > 350) return null;
  return MANAGED_PATTERNS.find(([, pattern]) => pattern.test(path))?.[0] || null;
}
function reply(res, code, json, headers = {}) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(json));
}
function isPreview() {
  return process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === BRANCH;
}
function githubToken() {
  const token = process.env.PORTFOLIO_GITHUB_TOKEN;
  return typeof token === 'string' && token.length >= 30 ? token : null;
}
function apiHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Darkraider-Portfolio-Studio'
  };
}
function remoteError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}
async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: apiHeaders(token), cache: 'no-store', signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw remoteError('Could not read the current media library from GitHub. Check token permissions.');
  return response.json();
}

// All strings across the JSON are checked, not just project covers, so that a
// file cannot be deleted while referenced by another current or future section.
function referencedPaths(json) {
  const uses = new Map();
  let seen = 0;
  function visit(value, depth = 0) {
    if (depth > 18 || ++seen > 50000) throw remoteError('Portfolio references exceed the safe scan limit.', 422);
    if (typeof value === 'string') {
      let candidate = value.trim().replace(/^(?:\.\/|\/)+/, '');
      if (/^https?:\/\//i.test(candidate)) {
        try { candidate = new URL(candidate).pathname.replace(/^\/+/, ''); }
        catch { return; }
      }
      candidate = candidate.split(/[?#]/, 1)[0];
      // Count a reference only when the string is an actual managed-media path.
      if (mediaKind(candidate)) uses.set(candidate, (uses.get(candidate) || 0) + 1);
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item, depth + 1);
    }
  }
  visit(json);
  return uses;
}
async function readPublishedReferences(token) {
  const file = await githubJson(`${BASE}/contents/${JSON_FILE}?ref=${encodeURIComponent(BRANCH)}`, token);
  if (file?.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw remoteError('Published portfolio data could not be checked; deletion is disabled.');
  }
  let data;
  try {
    const raw = Buffer.from(file.content.replace(/\s/g, ''), 'base64');
    if (raw.length > 250 * 1024) throw new Error('Too large');
    data = JSON.parse(raw.toString('utf8'));
  } catch { throw remoteError('Published portfolio data could not be parsed; deletion is disabled.'); }
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.projects) ||
      !Array.isArray(data.certifications) || !data.profile || !data.site) {
    throw remoteError('Published portfolio format is not recognized; deletion is disabled.');
  }
  return referencedPaths(data);
}
async function managedTree(token) {
  const tree = await githubJson(`${BASE}/git/trees/${encodeURIComponent(BRANCH)}?recursive=1`, token);
  if (!Array.isArray(tree?.tree) || tree.truncated === true) {
    throw remoteError('GitHub returned an incomplete file list. Deletion is disabled.');
  }
  const files = tree.tree.filter(entry => entry?.type === 'blob' && mediaKind(entry.path) &&
      typeof entry.sha === 'string' && /^[a-f0-9]{40}$/.test(entry.sha));
  if (files.length > 1000) throw remoteError('Too many managed files to list safely.');
  return files;
}

async function handle(req, res) {
  if (!auth.isSessionAuthenticated(req)) return reply(res, 401, { error: 'Admin session expired. Sign in again.' });
  if (!isPreview()) return reply(res, 403, { error: 'Media management is available only on the portfolio-admin Preview deployment.' });
  if (!['GET', 'DELETE'].includes(req.method)) return reply(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, DELETE' });
  if (req.method === 'DELETE' && !auth.isAllowedOrigin(req)) return reply(res, 403, { error: 'Request origin was rejected.' });
  const token = githubToken();
  if (!token) return reply(res, 503, { error: 'PORTFOLIO_GITHUB_TOKEN is missing from this Preview deployment.' });

  try {
    if (req.method === 'GET') {
      const [tree, references] = await Promise.all([managedTree(token), readPublishedReferences(token)]);
      const items = tree.map(entry => ({
        path: entry.path, kind: mediaKind(entry.path), sha: entry.sha,
        size: Number.isSafeInteger(entry.size) ? entry.size : null,
        referenceCount: references.get(entry.path) || 0,
        referenced: references.has(entry.path)
      })).sort((a,b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
      return reply(res, 200, { branch: BRANCH, items });
    }

    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return reply(res, 415, { error: 'Expected application/json.' });
    }
    const length = Number(req.headers['content-length'] || 0);
    if (!Number.isSafeInteger(length) || length > MAX_DELETE_REQUEST_BYTES) {
      return reply(res, 413, { error: 'Invalid delete request size.' });
    }
    let body = req.body;
    if (Buffer.isBuffer(body)) body = JSON.parse(body.toString('utf8'));
    else if (typeof body === 'string') body = JSON.parse(body);
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !mediaKind(body.path) || typeof body.sha !== 'string' || !/^[a-f0-9]{40}$/.test(body.sha)) {
      return reply(res, 400, { error: 'Only existing managed uploads can be deleted.' });
    }
    // Fetch BOTH the latest tree and the latest portfolio references for each
    // deletion; never rely on client claims that a file is unused.
    const [tree, references] = await Promise.all([managedTree(token), readPublishedReferences(token)]);
    if (references.has(body.path)) {
      return reply(res, 409, { error: 'This file is still linked in published portfolio.json. Unlink or replace it and publish your changes first.' });
    }
    const entry = tree.find(item => item.path === body.path);
    if (!entry) return reply(res, 404, { error: 'File is already missing from the current branch.' });
    if (entry.sha !== body.sha) return reply(res, 409, { error: 'File has changed in GitHub. Refresh the media library before deleting.' });

    const response = await fetch(`${BASE}/contents/${body.path}`, {
      method: 'DELETE',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Remove unused portfolio media: ${body.path}`, sha: entry.sha, branch: BRANCH }),
      signal: AbortSignal.timeout(20000)
    });
    if (response.status === 409 || response.status === 422) {
      return reply(res, 409, { error: 'GitHub reported a conflict. Refresh the media library and try again.' });
    }
    if (!response.ok) throw remoteError('GitHub rejected the deletion. Check repository permissions.');
    const deleted = await response.json();
    if (!/^[a-f0-9]{40}$/.test(deleted?.commit?.sha || '')) throw remoteError('GitHub did not confirm the deletion. Check the repository before retrying.');
    return reply(res, 200, { deleted: true, branch: BRANCH, path: body.path, commit: deleted.commit.sha });
  } catch (error) {
    if (error instanceof SyntaxError) return reply(res, 400, { error: 'Invalid request JSON.' });
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return reply(res, 504, { error: 'GitHub timed out. Refresh and try again.' });
    console.error('[DARKRAIDER media library]', error?.message || error);
    return reply(res, Number.isInteger(error?.status) ? error.status : 502,
      { error: error?.status ? error.message : 'GitHub media management failed. Try again.' });
  }
}

module.exports = handle;
