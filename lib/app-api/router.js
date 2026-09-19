import { getAppApiConfig } from '../config/app-api.js';
import { createAppUser, sessionForApp, bindAppUser, appSessionQqUser } from '../game/app-channel.service.js';
import { executeAppCommand, appQuickPanel } from './app-command.service.js';

const secureRequest = (ctx) => {
    const config = getAppApiConfig();
    if (!config.enabled)
        return false;
    const remote = String(ctx.req?.socket?.remoteAddress ?? '');
    const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
    if (loopback.has(remote))
        return true;
    return config.allowInsecurePublicHttp === true || String(ctx.get('x-forwarded-proto') ?? '').toLowerCase() === 'https';
};
const apiError = (ctx, status, message) => {
    ctx.status = status;
    ctx.type = 'application/json';
    ctx.body = { ok: false, message };
};
const parseBody = async (ctx) => {
    const length = Number(ctx.get('content-length') || 0);
    if (length > 64 * 1024)
        throw new Error('请求体过大。');
    const chunks = [];
    let size = 0;
    for await (const chunk of ctx.req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 64 * 1024)
            throw new Error('请求体过大。');
        chunks.push(buffer);
    }
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text)
        return {};
    try {
        const result = JSON.parse(text);
        return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
    }
    catch {
        throw new Error('请求格式无效。');
    }
};
const bearer = (ctx) => {
    const header = String(ctx.get('authorization') ?? '');
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
};
const requireSession = async (ctx) => {
    if (!secureRequest(ctx)) {
        apiError(ctx, 404, '未找到接口。');
        return null;
    }
    const token = bearer(ctx);
    if (!token) {
        apiError(ctx, 401, '缺少访问令牌。');
        return null;
    }
    const session = await sessionForApp(token);
    if (!session) {
        apiError(ctx, 401, '登录已失效，请重新登录。');
        return null;
    }
    return session;
};
const registerAppApiRoutes = (router) => {
    router.get('/app-api/v1/health', async (ctx) => {
        ctx.type = 'application/json';
        ctx.body = { ok: true, service: 'fantasy-final-game-core', time: new Date().toISOString() };
    });
    router.post('/app-api/v1/register', async (ctx) => {
        try {
            if (!secureRequest(ctx)) {
                apiError(ctx, 404, '未找到接口。');
                return;
            }
            const body = await parseBody(ctx);
            const displayName = String(body.displayName ?? '').trim();
            if (!displayName) {
                apiError(ctx, 400, '请填写昵称。');
                return;
            }
            const created = await createAppUser(displayName);
            ctx.type = 'application/json';
            ctx.body = { ok: true, accessToken: created.token, appUserId: created.appUserId };
        }
        catch (error) {
            apiError(ctx, 400, error instanceof Error ? error.message : '注册失败。');
        }
    });
    router.post('/app-api/v1/bind', async (ctx) => {
        try {
            if (!secureRequest(ctx)) {
                apiError(ctx, 404, '未找到接口。');
                return;
            }
            const body = await parseBody(ctx);
            const token = bearer(ctx);
            if (!token) {
                apiError(ctx, 401, '缺少访问令牌。');
                return;
            }
            const session = await sessionForApp(token);
            if (!session) {
                apiError(ctx, 401, '登录已失效，请重新登录。');
                return;
            }
            const result = await bindAppUser(session.appUserId, String(body.code ?? ''));
            ctx.type = 'application/json';
            ctx.body = {
                ok: true,
                qqUserId: result.qqUserId,
                characterId: result.characterId,
                message: result.characterId ? '已绑定现有角色。' : '绑定成功，可继续创建角色。'
            };
        }
        catch (error) {
            apiError(ctx, 400, error instanceof Error ? error.message : '绑定失败。');
        }
    });
    router.post('/app-api/v1/command', async (ctx) => {
        const session = await requireSession(ctx);
        if (!session)
            return;
        try {
            const body = await parseBody(ctx);
            const command = String(body.command ?? '').trim();
            if (!command) {
                apiError(ctx, 400, '缺少命令。');
                return;
            }
            const qqUserId = await appSessionQqUser(session);
            const result = await executeAppCommand({ qqUserId, command });
            ctx.type = 'application/json';
            ctx.body = { ok: true, ...result, serverTime: new Date().toISOString() };
        }
        catch (error) {
            apiError(ctx, 400, error instanceof Error ? error.message : '命令执行失败。');
        }
    });
    router.get('/app-api/v1/panel', async (ctx) => {
        const session = await requireSession(ctx);
        if (!session)
            return;
        ctx.type = 'application/json';
        ctx.body = { ok: true, ...appQuickPanel() };
    });
};

export { registerAppApiRoutes };
