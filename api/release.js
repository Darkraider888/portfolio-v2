/**
 * DARKRAIDER STUDIO / Release Center
 *
 * GET: Authenticated, preview-only release readiness for main versus portfolio-admin.
 * POST: Freeze the reviewed preview commit into a GitHub release branch.
 *
 * This endpoint NEVER edits main, merges code, opens a pull request, or deploys.
 * The owner reviews the snapshot in GitHub and merges a pull request manually.
 * Needs only the existing Contents: read/write GitHub fine-grained token.
 */
'use strict';

const auth = require('./admin.js');
const REPOSITORY = 'Darkraider888/portfolio-v2';
const GITHUB = `https://api.github.com/repos/${REPOSITORY}`;
const BASE = 'main';
const PREVIEW = 'portfolio-admin';
const MAX_BODY_BYTES = 1024;
const SHA = /^[0-9a-f]{40}$/;
const RELEASE_REF_PATTERN = /^refs\/heads\/release\/portfolio-[0-9a-f]{12}$/;

function reply(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.end(JSON.stringify(data));
}
function allowedPreview() {
  return process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === PREVIEW;
}
function token() {
  const value = process.env.PORTFOLIO_GITHUB_TOKEN;
  return typeof value === 'string' && value.length >= 30 ? value : null;
}
class ReleaseError extends Error {
  constructor(message, status=502) {super(message);this.status=status;}
}
async function github(path, accessToken, options={}) {
  let response;
  try {
    response = await fetch(GITHUB + path, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Darkraider-Portfolio-Studio',
        ...(options.body ? {'Content-Type':'application/json'} : {})
      },
      ...(options.body ? {body:JSON.stringify(options.body)} : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(18000)
    });
  } catch (error) {
    if(error?.name==='AbortError'||error?.name==='TimeoutError') {
      throw new ReleaseError('GitHub took too long to respond. Try again.',504);
    }
    throw new ReleaseError('Cannot connect to GitHub right now.');
  }
  let payload = {};
  try { payload=await response.json(); } catch {
    throw new ReleaseError('GitHub returned an invalid response.');
  }
  if (!response.ok && !(options.allowExists && response.status===422)) {
    const code = response.status;
    if(code===401||code===403) throw new ReleaseError('GitHub access was denied. Verify the configured token and repository permissions.',503);
    if(code===404) throw new ReleaseError('Could not find the GitHub branch or file. Verify the repository configuration.',404);
    if(code===409||code===422) throw new ReleaseError('GitHub rejected the release branch. Refresh and retry.',409);
    throw new ReleaseError('GitHub returned an error while checking release readiness.');
  }
  return {status:response.status,body:payload};
}
function decodeContents(item, kind) {
  if (item?.type!=='file' || item.encoding!=='base64' || typeof item.content!=='string' ||
      typeof item.sha!=='string' || !SHA.test(item.sha)) {
    throw new ReleaseError(`GitHub ${kind} could not be verified.`,422);
  }
  const raw = Buffer.from(item.content.replace(/\s/g,''),'base64');
  if(raw.length<10 || raw.length>250*1024) throw new ReleaseError(`${kind} exceeds the release validation limit.`,422);
  return {content:raw.toString('utf8'),sha:item.sha};
}
function compareUrl(branch) {
  return `https://github.com/${REPOSITORY}/compare/${BASE}...${branch.replaceAll('/', '%2F')}?expand=1`;
}
function releasesUrl() {
  return `https://github.com/${REPOSITORY}/pulls?q=is%3Apr+is%3Amerged`;
}
async function readStatus(accessToken) {
  const results = await Promise.all([
    github(`/git/ref/heads/${BASE}`,accessToken),
    github(`/git/ref/heads/${PREVIEW}`,accessToken),
    github(`/compare/${BASE}...${PREVIEW}?per_page=100`,accessToken),
    github(`/contents/data/portfolio.json?ref=${PREVIEW}`,accessToken),
    github(`/contents/index.html?ref=${PREVIEW}`,accessToken)
  ]);
  const [mainRef,previewRef,comparison,jsonFile,indexFile] = results.map(x=>x.body);
  const mainSha=mainRef?.object?.sha;
  const previewSha=previewRef?.object?.sha;
  if(!SHA.test(mainSha||'') || !SHA.test(previewSha||'') ||
     mainRef?.object?.type!=='commit' || previewRef?.object?.type!=='commit') {
    throw new ReleaseError('GitHub branch commit identifiers could not be verified.',422);
  }
  const dataFile=decodeContents(jsonFile,'portfolio data');
  const homepage=decodeContents(indexFile,'homepage');
  let data;
  try {data=JSON.parse(dataFile.content);} catch {throw new ReleaseError('The preview portfolio JSON cannot be parsed.',422);}
  if(data?.schemaVersion!==1||!Array.isArray(data?.projects)||!Array.isArray(data?.skills)||
     !Array.isArray(data?.certifications)||typeof data.site!=='object') {
    throw new ReleaseError('The preview portfolio schema is not ready for release.',422);
  }
  const files=comparison?.files;
  const ahead=comparison?.ahead_by;
  const behind=comparison?.behind_by;
  if(!Array.isArray(files)||!Number.isSafeInteger(ahead)||!Number.isSafeInteger(behind)||
     ahead<0||behind<0 || !['ahead','behind','diverged','identical'].includes(comparison?.status)) {
    throw new ReleaseError('GitHub could not provide a trustworthy branch comparison.',422);
  }
  // GitHub only provides up to 300 changed paths through this API.
  const blockers=[];
  const warnings=[];
  if(ahead===0)blockers.push('There are no new preview commits to release.');
  if(files.length>=300)blockers.push('More than 299 files changed. Review the full diff on GitHub before releasing.');
  if(homepage.content.includes('demo-portfolio-ecru.vercel.app')) {
    blockers.push('index.html still contains the old demo-portfolio-ecru.vercel.app canonical/social links. Correct them before preparing a release.');
  }
  if(!/^https:\/\/[^\s]+\/$/.test(String(data.site?.siteUrl||''))) {
    blockers.push('Settings → Website URL must be a valid HTTPS homepage URL ending with /.');
  }
  if(behind>0) warnings.push(`The live branch has ${behind} commit${behind===1?'':'s'} not included in the preview history. Check PR conflicts before merging.`);
  if(ahead>0 && files.length===0)warnings.push('Branch history differs, but GitHub reports no changed files. Confirm the diff before merging.');
  const iconPaths = files.filter(x=>x && /^assets\/skills\/icon-[0-9a-f-]+\.(png|jpg|webp)$/i.test(x.filename||'') && x.status!=='removed');
  const usedSkillIcons=new Set(data.skills.flatMap(g=>Array.isArray(g?.items)?g.items.map(i=>i?.iconUrl):[]));
  const unusedSkillIcons=iconPaths.filter(x=>!usedSkillIcons.has(x.filename)).length;
  if(unusedSkillIcons) warnings.push(`${unusedSkillIcons} custom skill icon${unusedSkillIcons===1?' is':'s are'} included in this diff but not referenced by the published portfolio. You can remove unused icons from Media before releasing.`);
  const changedFiles=files.map(f=>({
    path: typeof f.filename==='string'?f.filename.slice(0,400):'',
    status:['added','modified','removed','renamed','changed'].includes(f.status)?f.status:'changed',
    changes:Number.isInteger(f.changes)?f.changes:0
  }));
  return {
    base:BASE,preview:PREVIEW,mainHead:mainSha,previewHead:previewSha,
    portfolioSha:dataFile.sha,status:comparison.status,
    aheadBy:ahead,behindBy:behind,changedFiles,
    projectCount:data.projects.length,certificateCount:data.certifications.length,
    blockers,warnings,
    compareUrl:compareUrl(PREVIEW),
    pullRequestsUrl:`https://github.com/${REPOSITORY}/pulls`,
    mergedReleasesUrl:releasesUrl(),
    publicUrl:data.site.siteUrl
  };
}
function readRequest(req) {
  const length=Number(req.headers['content-length']||0);
  if(!Number.isFinite(length)||length<0||length>MAX_BODY_BYTES)throw new ReleaseError('Release request is too large.',413);
  let body=req.body;
  if(Buffer.isBuffer(body)) body=body.toString('utf8');
  if(typeof body==='string') {
    try {body=JSON.parse(body);} catch {throw new ReleaseError('Invalid release request JSON.',400);}
  }
  if(body===null||!body||Array.isArray(body)||typeof body!=='object')throw new ReleaseError('Invalid release request.',400);
  if(Object.keys(body).sort().join(',')!=='action,expectedMainHead,expectedPortfolioSha,expectedPreviewHead' || body.action!=='prepare' ||
    !SHA.test(body.expectedMainHead||'') || !SHA.test(body.expectedPreviewHead||'') ||
    !SHA.test(body.expectedPortfolioSha||''))throw new ReleaseError('Release verification information is invalid.',422);
  return body;
}
async function prepare(status,accessToken){
  const short=status.previewHead.slice(0,12);
  const branch=`release/portfolio-${short}`;
  const ref=`refs/heads/${branch}`;
  if(!RELEASE_REF_PATTERN.test(ref))throw new ReleaseError('Generated branch name is invalid.',422);
  const result=await github('/git/refs',accessToken,{
    method:'POST',body:{ref,sha:status.previewHead},allowExists:true
  });
  let created=result.status===201;
  if(!created){
    // A repeat click is safe only if the existing snapshot points at the SAME commit.
    const existing=(await github(`/git/ref/heads/${branch}`,accessToken)).body;
    if(existing?.ref!==ref||existing?.object?.sha!==status.previewHead) {
      throw new ReleaseError('The release branch name is already in use for a different commit.',409);
    }
  } else if(result.body?.ref!==ref || result.body?.object?.sha!==status.previewHead){
    throw new ReleaseError('GitHub did not confirm the exact release snapshot. Verify the branch before proceeding.',502);
  }
  return {prepared:true,created,branch,sha:status.previewHead,
    pullRequestUrl:compareUrl(branch),
    branchUrl:`https://github.com/${REPOSITORY}/tree/${branch}`,
    message:'Snapshot prepared. Review the GitHub diff and manually merge a pull request into main when ready. No production deployment has happened.'};
}
async function handler(req,res) {
  if(!allowedPreview())return reply(res,403,{error:'Release tools are available only on portfolio-admin Preview deployments.'});
  if(!auth.isSessionAuthenticated(req))return reply(res,401,{error:'Admin session expired. Sign in again.'});
  if(req.method!=='GET'&&req.method!=='POST')return reply(res,405,{error:'Method not allowed.'});
  if(req.method==='POST'&&!auth.isAllowedOrigin(req))return reply(res,403,{error:'Request origin was rejected.'});
  const accessToken=token();
  if(!accessToken)return reply(res,503,{error:'PORTFOLIO_GITHUB_TOKEN is not configured for Preview.'});
  try{
    if(req.method==='GET')return reply(res,200,{ok:true,...await readStatus(accessToken)});
    if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) {
      return reply(res,415,{error:'Expected application/json.'});
    }
    const body=readRequest(req);
    const state=await readStatus(accessToken);
    if(state.previewHead!==body.expectedPreviewHead || state.mainHead!==body.expectedMainHead ||
       state.portfolioSha!==body.expectedPortfolioSha) {
      return reply(res,409,{error:'GitHub content changed since your last review. Refresh Release status before preparing a snapshot.'});
    }
    if(state.blockers.length)return reply(res,409,{error:'Resolve release blockers before creating a snapshot.',blockers:state.blockers});
    const prepared=await prepare(state,accessToken);
    return reply(res,200,{ok:true,...prepared});
  }catch(error){
    if(!(error instanceof ReleaseError))console.error('[Portfolio release status]',error?.message||String(error));
    return reply(res,error?.status||502,{error:error instanceof ReleaseError?error.message:'Release preparation failed. No production changes were made.'});
  }
}
module.exports=handler;
