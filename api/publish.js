/**
 * DARKRAIDER STUDIO - preview-only JSON publishing endpoint (Step 4D).
 * GET  /api/publish reads latest data/portfolio.json from the configured branch.
 * POST /api/publish replaces only that JSON file through GitHub's Contents API.
 *
 * - Requires the same HMAC-signed session cookie as /api/admin.
 * - Restricts operations to PREVIEW deployments AND the portfolio-admin branch.
 * - Uses a fine-grained single-repository GitHub token on the server only.
 * - Checks the existing Git blob SHA to prevent overwriting concurrent edits.
 * - Does NOT upload images, PDFs, or arbitrary paths.
 */
'use strict';

const auth = require('./admin.js');
const REPO = 'Darkraider888/portfolio-v2';
const FILE_PATH = 'data/portfolio.json';
const BRANCH = 'portfolio-admin';
const MAX_JSON_BYTES = 250 * 1024;
const CONTENTS_API = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
const GITHUB_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Darkraider-Portfolio-Studio'
};

function reply(res, status, json, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(json));
}

function githubToken() {
  const token = process.env.PORTFOLIO_GITHUB_TOKEN;
  return typeof token === 'string' && token.length >= 30 ? token : null;
}

function isPreview() {
  // Fail closed when Vercel has not exposed its System Environment Variables.
  return process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === BRANCH;
}

function apiHeaders(token) {
  return { ...GITHUB_HEADERS, 'Authorization': `Bearer ${token}` };
}

async function readGithubFile(token) {
  const response = await fetch(`${CONTENTS_API}?ref=${encodeURIComponent(BRANCH)}`, {
    method: 'GET',
    headers: apiHeaders(token),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const error = new Error('Unable to read portfolio.json from GitHub. Confirm the repository token permissions.');
    error.status = 502;
    throw error;
  }
  const resource = await response.json();
  if (resource.type !== 'file' || resource.encoding !== 'base64' ||
      !/^[0-9a-f]{40}$/.test(resource.sha || '') || typeof resource.content !== 'string') {
    const error = new Error('Unexpected GitHub file response.');
    error.status = 502;
    throw error;
  }
  const decoded = Buffer.from(resource.content.replace(/\s/g, ''), 'base64');
  if (decoded.length > MAX_JSON_BYTES) {
    const error = new Error('The portfolio content file exceeds the editor limit.');
    error.status = 413;
    throw error;
  }
  let data;
  try { data = JSON.parse(decoded.toString('utf8')); }
  catch { const error = new Error('GitHub portfolio.json is not valid JSON.'); error.status = 502; throw error; }
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.projects)) {
    const error = new Error('GitHub portfolio content is not compatible with this editor.');
    error.status = 502;
    throw error;
  }
  return { sha: resource.sha, data };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringOrEmpty(value, maxLength) {
  return value === undefined || value === null ||
    (typeof value === 'string' && value.length <= maxLength);
}

function isAllowedUrl(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || value.length > 2000) return false;
  if (/^assets\/[a-z0-9_.\/-]+$/i.test(value) && !value.split('/').includes('..')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validateContent(data) {
  if (!isPlainObject(data) || data.schemaVersion !== 1 ||
      !isPlainObject(data.profile) || !Array.isArray(data.projects) ||
      !Array.isArray(data.certifications) || !Array.isArray(data.skills) ||
      !isPlainObject(data.about) || !isPlainObject(data.contact) ||
      !isPlainObject(data.site) || !isPlainObject(data.research) ||
      !Array.isArray(data.education)) return 'Unsupported portfolio data format.';
  if (!data.projects.length || data.projects.length > 150 ||
      data.certifications.length > 150 || data.skills.length > 100 ||
      data.education.length > 50) return 'Too many or too few entries.';
  const seenIds = new Set();
  let featuredCount = 0;
  for (const project of data.projects) {
    if (!isPlainObject(project) || typeof project.id !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id) || project.id.length > 100 ||
        seenIds.has(project.id)) return 'Invalid or duplicate project ID.';
    seenIds.add(project.id);
    if (typeof project.title !== 'string' || !project.title.trim() || project.title.length > 150 ||
        !isStringOrEmpty(project.description, 6000) || !Array.isArray(project.technologies) ||
        project.technologies.length > 60 || project.technologies.some(v => typeof v !== 'string' || v.length > 120)) {
      return 'Invalid project title, description, or technology list.';
    }
    if (project.featured === true && project.visible !== false) featuredCount++;
    if (['repositoryUrl', 'liveUrl', 'downloadUrl', 'imageUrl', 'coverUrl'].some(k => !isAllowedUrl(project[k]))) {
      return 'An invalid project URL was found.';
    }
    if (project.screenshots !== undefined &&
        (!Array.isArray(project.screenshots) || project.screenshots.length > 20 ||
        project.screenshots.some(url => !isAllowedUrl(url)))) {
      return 'Invalid project screenshot list.';
    }
    // Step 4H: optional platform-specific download links. Existing downloadUrl
    // remains supported; files are hosted outside the GitHub media API.
    if (project.downloads !== undefined) {
      if (!Array.isArray(project.downloads) || project.downloads.length > 10 ||
          project.downloads.some(item => !isPlainObject(item) ||
            typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80 ||
            (item.platform !== undefined &&
             (typeof item.platform !== 'string' || item.platform.length > 80)) ||
            typeof item.url !== 'string' || !item.url.trim() ||
            !isAllowedUrl(item.url) || !/^https?:\/\//i.test(item.url))) {
        return 'Invalid additional project download list.';
      }
    }
  }
  if (featuredCount > 1) return 'Only one visible project can be featured.';
  for (const cert of data.certifications) {
    if (!isPlainObject(cert) || typeof cert.title !== 'string' || !cert.title.trim() ||
        cert.title.length > 200 || !isStringOrEmpty(cert.description, 3000) ||
        ['verificationUrl','link','fileUrl','certificateUrl'].some(k => !isAllowedUrl(cert[k]))) {
      return 'Invalid certificate details or link.';
    }
  }
  return null;
}

async function handle(req, res) {
  if (!auth.isSessionAuthenticated(req)) return reply(res, 401, { error: 'Admin session expired. Sign in again.' });
  if (!isPreview()) return reply(res, 403, { error: 'Publishing is only available on the portfolio-admin Preview deployment. Enable Vercel system environment variables if needed.' });
  const token = githubToken();
  if (!token) return reply(res, 503, { error: 'PORTFOLIO_GITHUB_TOKEN is missing from this Preview deployment.' });

  try {
    if (req.method === 'GET') {
      const current = await readGithubFile(token);
      return reply(res, 200, { branch: BRANCH, sha: current.sha, data: current.data });
    }
    if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
    if (!auth.isAllowedOrigin(req)) return reply(res, 403, { error: 'Request origin was rejected.' });
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return reply(res, 415, { error: 'Expected application/json.' });
    }
    const declaredSize = Number(req.headers['content-length'] || 0);
    if (!Number.isFinite(declaredSize) || declaredSize > MAX_JSON_BYTES) {
      return reply(res, 413, { error: 'The request is too large.' });
    }
    let body = req.body;
    if (Buffer.isBuffer(body)) body = JSON.parse(body.toString('utf8'));
    if (typeof body === 'string') body = JSON.parse(body);
    const bytes = Buffer.byteLength(JSON.stringify(body || null), 'utf8');
    if (bytes > MAX_JSON_BYTES) return reply(res, 413, { error: 'The request is too large.' });
    if (!isPlainObject(body) || typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/.test(body.sha)) {
      return reply(res, 400, { error: 'Missing or invalid source revision.' });
    }
    const problem = validateContent(body.data);
    if (problem) return reply(res, 422, { error: problem });
    const current = await readGithubFile(token);
    if (current.sha !== body.sha) {
      return reply(res, 409, { error: 'Someone updated portfolio.json since you opened the editor. Export your draft, then reload and reconcile before publishing.' });
    }
    const content = Buffer.from(JSON.stringify(body.data, null, 2) + '\n', 'utf8').toString('base64');
    const response = await fetch(CONTENTS_API, {
      method: 'PUT',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update portfolio content using DARKRAIDER STUDIO',
        content,
        sha: current.sha,
        branch: BRANCH
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 409 || response.status === 422) {
      return reply(res, 409, { error: 'GitHub reported a conflict. Export your draft, refresh and try again.' });
    }
    if (!response.ok) {
      return reply(res, 502, { error: 'GitHub rejected the update. Check your token repository and Contents permission.' });
    }
    const updated = await response.json();
    const newSha = updated?.content?.sha;
    return reply(res, 200, {
      published: true,
      branch: BRANCH,
      sha: typeof newSha === 'string' ? newSha : null,
      commit: updated?.commit?.sha || null,
      message: 'Saved to portfolio-admin. Vercel will create a new Preview deployment.'
    });
  } catch (error) {
    if (error instanceof SyntaxError) return reply(res, 400, { error: 'Request body is not valid JSON.' });
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return reply(res, 504, { error: 'GitHub timed out. Try again.' });
    }
    console.error('[DARKRAIDER publish]', error?.message || error);
    return reply(res, Number.isInteger(error?.status) ? error.status : 502,
      { error: error?.status ? error.message : 'Unable to reach GitHub. Try again later.' });
  }
}

module.exports = handle;
