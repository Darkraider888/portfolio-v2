/**
 * DARKRAIDER STUDIO - authenticated portfolio media uploads (Step 4E).
 * POST /api/media only, uses JSON with one Base64-encoded image/PDF per request.
 * Files are committed to a generated, non-overwriting path on portfolio-admin.
 * Never sends or exposes the GitHub token to the browser.
 *
 * Limits: 2 MiB per file keeps Base64 JSON below Vercel's 4.5 MB body limit.
 * This deliberately does NOT accept arbitrary paths or executable formats.
 * Larger assets should use a dedicated media host or GitHub Releases.
 */
'use strict';

const crypto = require('node:crypto');
const auth = require('./admin.js');

const REPO = 'Darkraider888/portfolio-v2';
const BRANCH = 'portfolio-admin';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 3 * 1024 * 1024;
const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/`;
const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIME_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
});

function reply(res, code, result, headers = {}) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(result));
}

function isPreview() {
  return process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === BRANCH;
}

function getToken() {
  const token = process.env.PORTFOLIO_GITHUB_TOKEN;
  return typeof token === 'string' && token.length >= 30 ? token : null;
}

function contentSignature(bytes) {
  if (bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 5 && bytes.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

function extractFile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request format.' };
  if (!['project-cover', 'project-screenshot', 'certificate'].includes(body.kind)) {
    return { error: 'Unsupported media category.' };
  }
  if (body.kind !== 'certificate' &&
      (typeof body.projectId !== 'string' || body.projectId.length > 100 ||
       !PROJECT_ID_PATTERN.test(body.projectId))) {
    return { error: 'Invalid project ID.' };
  }
  if (typeof body.mimeType !== 'string' || !MIME_TYPES[body.mimeType]) {
    return { error: 'Only JPG, PNG, WebP and PDF files are supported.' };
  }
  if (body.kind !== 'certificate' && body.mimeType === 'application/pdf') {
    return { error: 'Project covers and screenshots must be images.' };
  }
  const encoded = body.base64;
  if (typeof encoded !== 'string' || encoded.length < 8 ||
      encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    return { error: 'Invalid or oversized Base64 data.' };
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > MAX_FILE_BYTES || bytes.toString('base64') !== encoded) {
    return { error: 'Invalid or oversized file.' };
  }
  const actualMime = contentSignature(bytes);
  if (actualMime !== body.mimeType) {
    return { error: 'File contents do not match the declared type.' };
  }
  // Name and client-provided path are deliberately ignored to prevent traversal.
  const suffix = crypto.randomUUID();
  const extension = MIME_TYPES[actualMime];
  let path;
  if (body.kind === 'project-cover') path = `assets/projects/${body.projectId}/cover-${suffix}.${extension}`;
  else if (body.kind === 'project-screenshot') path = `assets/projects/${body.projectId}/screenshots/${suffix}.${extension}`;
  else path = `assets/certificates/certificate-${suffix}.${extension}`;
  return { path, bytes, actualMime };
}

async function handle(req, res) {
  if (!auth.isSessionAuthenticated(req)) {
    return reply(res, 401, { error: 'Admin session expired. Sign in again.' });
  }
  if (!isPreview()) {
    return reply(res, 403, { error: 'Media uploads work only on portfolio-admin Preview deployments.' });
  }
  if (req.method !== 'POST') {
    return reply(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  }
  if (!auth.isAllowedOrigin(req)) {
    return reply(res, 403, { error: 'Request origin was rejected.' });
  }
  const token = getToken();
  if (!token) return reply(res, 503, { error: 'PORTFOLIO_GITHUB_TOKEN is missing from this Preview deployment.' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return reply(res, 415, { error: 'Expected application/json.' });
  }
  const size = Number(req.headers['content-length'] || 0);
  if (!Number.isFinite(size) || size > MAX_REQUEST_BYTES) {
    return reply(res, 413, { error: 'Request too large. Use a file under 2 MB.' });
  }

  try {
    let body = req.body;
    if (Buffer.isBuffer(body)) body = JSON.parse(body.toString('utf8'));
    else if (typeof body === 'string') body = JSON.parse(body);
    const media = extractFile(body);
    if (media.error) return reply(res, 422, { error: media.error });

    const response = await fetch(`${GITHUB_API}${media.path}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Darkraider-Portfolio-Studio',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        branch: BRANCH,
        message: `Add portfolio ${body.kind} media`,
        content: media.bytes.toString('base64')
      }),
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      const status = response.status === 409 || response.status === 422 ? 409 : 502;
      return reply(res, status, { error: 'GitHub could not save this file. Check the token permissions and try again.' });
    }
    const result = await response.json();
    if (result?.content?.path !== media.path || !/^[a-f0-9]{40}$/.test(result?.content?.sha || '')) {
      return reply(res, 502, { error: 'GitHub did not confirm the uploaded file. Verify it before retrying.' });
    }
    return reply(res, 201, {
      uploaded: true,
      branch: BRANCH,
      path: media.path,
      mimeType: media.actualMime,
      size: media.bytes.length,
      commit: result?.commit?.sha || null
    });
  } catch (error) {
    if (error instanceof SyntaxError) return reply(res, 400, { error: 'Invalid request JSON.' });
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return reply(res, 504, { error: 'GitHub timed out. Check your repository before retrying.' });
    }
    console.error('[Portfolio media upload]', error?.message || String(error));
    return reply(res, 502, { error: 'Media upload could not be completed.' });
  }
}

module.exports = handle;
