import Koa from 'koa';
import koaRouter from 'koa-router';
import { logger } from 'alemonjs';
import { getAppApiServerConfig } from '../config/app-api-server.js';
import { registerAppApiRoutes } from './router.js';

const closePreviousServer = async () => {
    const state = globalThis;
    const previousServer = state.__fantasyFinalAppApiServer;
    if (!previousServer?.listening)
        return;
    await new Promise((resolve, reject) => {
        previousServer.close(error => (error ? reject(error) : resolve()));
    });
    delete state.__fantasyFinalAppApiServer;
};
const startAppApiServer = async () => {
    const config = getAppApiServerConfig();
    if (!config.enabled)
        return;
    await closePreviousServer();
    const app = new Koa();
    app.use(async (ctx, next) => {
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        ctx.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        if (ctx.method === 'OPTIONS') {
            ctx.status = 204;
            return;
        }
        await next();
    });
    const router = new koaRouter();
    registerAppApiRoutes(router);
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
    globalThis.__fantasyFinalAppApiServer = server;
    logger.info(`App 网关已启动：http://${config.listenHost}:${config.port}/app-api/v1`);
};

export { startAppApiServer };
