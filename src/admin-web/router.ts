import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type koaRouter from 'koa-router';
import { getAdminWebConfig } from '../config/admin-web';
import pearAdminCover from '../assets/game/story/pear-admin-cover.png';
import { adminCoverPath, adminPage, loginPage } from './page';
import { createWebAdminAccount, loginAdminWeb, logoutAdminWeb, sessionForAdminWeb, setWebAdminEnabled, webAdminAccounts, type WebSession } from '../game/admin-web.service';
import { adminDashboard, adminPlayerDetail, adminPlayers, adminWebJournals, adminWorldOverview, changeGlobalMultiplierFromWeb, runWebPlayerAudit } from '../game/admin-web-data.service';
import { monitorSnapshot } from '../game/monitor.service';

type Context = any;
const cookieName = 'fantasyfinal_admin_session';
const csrfCookieName = 'fantasyfinal_admin_csrf';
const pearAdminCoverFile = decodeURI(pearAdminCover);
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const remoteAddress = (ctx: Context) => String(ctx.req?.socket?.remoteAddress ?? '');
const configFor = () => getAdminWebConfig();
const expectedHost = (config: ReturnType<typeof configFor>) => config.publicBaseUrl ? new URL(config.publicBaseUrl).host.toLowerCase() : null;

const secureAdminRequest = (ctx: Context) => {
  const config = configFor(); if (!config.enabled) return false;
  const remote = remoteAddress(ctx); const trustedProxy = config.trustedProxyIps.includes(remote);
  const host = String(ctx.get('host') ?? '').toLowerCase(); const expected = expectedHost(config);
  if (expected) {
    const forwardedProto = trustedProxy ? String(ctx.get('x-forwarded-proto')).split(',')[0].trim().toLowerCase() : '';
    return trustedProxy && forwardedProto === 'https' && host === expected;
  }
  return loopback.has(remote) && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
};

const clientIp = (ctx: Context) => {
  const config = configFor(); const remote = remoteAddress(ctx);
  if (config.trustedProxyIps.includes(remote)) return String(ctx.get('x-forwarded-for')).split(',')[0].trim().slice(0, 64) || remote;
  return remote.slice(0, 64);
};

const securityHeaders = (ctx: Context, nonce: string) => {
  ctx.set('Cache-Control', 'no-store');
  ctx.set('X-Content-Type-Options', 'nosniff'); ctx.set('X-Frame-Options', 'DENY'); ctx.set('Referrer-Policy', 'no-referrer');
  ctx.set('Content-Security-Policy', `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
};

const parseBody = async (ctx: Context) => {
  const length = Number(ctx.get('content-length') || 0); if (length > 64 * 1024) throw new Error('请求体过大。');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of ctx.req) { const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += buffer.length; if (size > 64 * 1024) throw new Error('请求体过大。'); chunks.push(buffer); }
  const text = Buffer.concat(chunks).toString('utf8').trim(); if (!text) return {};
  try { const result = JSON.parse(text); return result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {}; } catch { throw new Error('请求格式无效。'); }
};

const apiError = (ctx: Context, status: number, message: string) => { ctx.status = status; ctx.type = 'application/json'; ctx.body = { message }; };
const sessionToken = (ctx: Context) => String(ctx.cookies.get(cookieName) ?? '');
const csrfHeader = (ctx: Context) => String(ctx.get('x-ff-csrf') ?? '');

const auth = async (ctx: Context, write = false): Promise<WebSession | null> => {
  if (!secureAdminRequest(ctx)) { apiError(ctx, 404, '未找到接口。'); return null; }
  if (write) {
    const origin = String(ctx.get('origin') ?? ''); const base = configFor().publicBaseUrl;
    if (base && origin !== base) { apiError(ctx, 403, '请求来源无效。'); return null; }
  }
  const session = await sessionForAdminWeb(sessionToken(ctx), write ? csrfHeader(ctx) : null);
  if (!session) { apiError(ctx, 401, '登录已失效，请重新登录。'); return null; }
  return session;
};

const api = async (ctx: Context, handler: (session: WebSession, body: Record<string, unknown>) => Promise<unknown>, write = false) => {
  try {
    const session = await auth(ctx, write); if (!session) return;
    const body = write ? await parseBody(ctx) : {};
    ctx.type = 'application/json'; ctx.body = await handler(session, body);
  } catch (error) {
    apiError(ctx, 400, error instanceof Error ? error.message : '请求处理失败。');
  }
};

export const registerAdminWebRoutes = (router: koaRouter) => {
  router.get(adminCoverPath, async (ctx: Context) => {
    if (!secureAdminRequest(ctx)) { ctx.status = 404; return; }
    ctx.set('Cache-Control', 'public, max-age=86400');
    ctx.type = 'image/png';
    ctx.body = createReadStream(pearAdminCoverFile);
  });

  router.get('/admin', async (ctx: Context) => {
    if (!secureAdminRequest(ctx)) { ctx.status = 404; return; }
    const nonce = randomBytes(18).toString('base64url'); securityHeaders(ctx, nonce);
    const session = await sessionForAdminWeb(sessionToken(ctx)); ctx.type = 'text/html';
    ctx.body = session ? adminPage(session, nonce) : loginPage(nonce);
  });

  router.post('/api/admin/session', async (ctx: Context) => {
    try {
      if (!secureAdminRequest(ctx)) { apiError(ctx, 404, '未找到接口。'); return; }
      const body = await parseBody(ctx); const login = await loginAdminWeb({ username: body.username, password: body.password, ip: clientIp(ctx) });
      const config = configFor(); ctx.cookies.set(cookieName, login.token, { httpOnly: true, sameSite: 'strict', secure: Boolean(config.publicBaseUrl), maxAge: config.sessionAbsoluteMinutes * 60_000, overwrite: true });
      ctx.cookies.set(csrfCookieName, login.csrfToken, { httpOnly: false, sameSite: 'strict', secure: Boolean(config.publicBaseUrl), maxAge: config.sessionAbsoluteMinutes * 60_000, overwrite: true });
      ctx.type = 'application/json'; ctx.body = { username: login.session.username, role: login.session.role };
    } catch (error) { apiError(ctx, 400, error instanceof Error ? error.message : '登录失败。'); }
  });

  router.delete('/api/admin/session', async (ctx: Context) => {
    const session = await auth(ctx, true); if (!session) return;
    await logoutAdminWeb(sessionToken(ctx)); ctx.cookies.set(cookieName, '', { httpOnly: true, sameSite: 'strict', secure: Boolean(configFor().publicBaseUrl), maxAge: 0, overwrite: true });
    ctx.cookies.set(csrfCookieName, '', { httpOnly: false, sameSite: 'strict', secure: Boolean(configFor().publicBaseUrl), maxAge: 0, overwrite: true });
    ctx.type = 'application/json'; ctx.body = { ok: true };
  });
  router.get('/api/admin/dashboard', ctx => api(ctx, async () => adminDashboard()));
  router.get('/api/admin/players', ctx => api(ctx, async () => adminPlayers(ctx.query)));
  router.get('/api/admin/players/:id', ctx => api(ctx, async () => adminPlayerDetail(Math.max(1, Number(ctx.params.id)))));
  router.post('/api/admin/players/:id/audit', ctx => api(ctx, async (session, body) => runWebPlayerAudit(session, Math.max(1, Number(ctx.params.id)), body.kind, body.reason), true));
  router.get('/api/admin/world', ctx => api(ctx, async () => adminWorldOverview()));
  router.post('/api/admin/world/multiplier', ctx => api(ctx, async (session, body) => ({ value: await changeGlobalMultiplierFromWeb(session, body.key, body.value, body.reason) }), true));
  router.get('/api/admin/journals', ctx => api(ctx, async () => adminWebJournals(ctx.query.page, ctx.query.keyword)));
  router.get('/api/admin/monitor', ctx => api(ctx, async () => monitorSnapshot()));
  router.get('/api/admin/accounts', ctx => api(ctx, async session => webAdminAccounts(session)));
  router.post('/api/admin/accounts', ctx => api(ctx, async (session, body) => { await createWebAdminAccount(session, { username: body.username, password: body.password, role: body.role }); return { ok: true }; }, true));
  router.patch('/api/admin/accounts/:username', ctx => api(ctx, async (session, body) => { await setWebAdminEnabled(session, ctx.params.username, Boolean(body.enabled)); return { ok: true }; }, true));
};
