import Koa from 'koa';
import koaRouter from 'koa-router';
import { logger } from 'alemonjs';
import { getAdminWebConfig } from '../config/admin-web.js';
import { registerAdminWebRoutes } from './router.js';

const closePreviousServer = async () => {
    const state = globalThis;
    const previousServer = state.__fantasyFinalAdminWebServer;
    if (!previousServer?.listening)
        return;
    await new Promise((resolve, reject) => {
        previousServer.close(error => (error ? reject(error) : resolve()));
    });
    delete state.__fantasyFinalAdminWebServer;
};
const startAdminWebServer = async () => {
    const config = getAdminWebConfig();
    if (!config.enabled)
        return;
    await closePreviousServer();
    const app = new Koa();
    const router = new koaRouter();
    registerAdminWebRoutes(router);
    app.use(router.routes());
    app.use(router.allowedMethods());
    const server = app.listen(config.port, config.listenHost);
    await new Promise((resolve, reject) => {
        const onListening = () => {
            server.off('error', onError);
            resolve();
        };
        const onError = (error) => {
            server.off('listening', onListening);
            reject(error);
        };
        server.once('listening', onListening);
        server.once('error', onError);
    });
    globalThis.__fantasyFinalAdminWebServer = server;
    const address = config.publicBaseUrl ?? `http://${config.listenHost}:${config.port}`;
    if (config.allowInsecurePublicHttp)
        logger.warn(`管理后台正以不安全 HTTP 公开：${address}/admin。账号、密码和会话可能被截获。`);
    else
        logger.info(`管理后台已启动：${address}/admin`);
};

export { startAdminWebServer };
