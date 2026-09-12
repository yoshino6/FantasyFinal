import type { Server } from 'node:http';
import Koa from 'koa';
import koaRouter from 'koa-router';
import { logger } from 'alemonjs';
import { getAdminWebConfig } from '../config/admin-web';
import { registerAdminWebRoutes } from './router';

type AdminWebGlobal = typeof globalThis & {
  __fantasyFinalAdminWebServer?: Server;
};

const closePreviousServer = async () => {
  const state = globalThis as AdminWebGlobal;
  const previousServer = state.__fantasyFinalAdminWebServer;
  if (!previousServer?.listening) return;

  await new Promise<void>((resolve, reject) => {
    previousServer.close(error => (error ? reject(error) : resolve()));
  });
  delete state.__fantasyFinalAdminWebServer;
};

export const startAdminWebServer = async () => {
  const config = getAdminWebConfig();
  if (!config.enabled) return;

  await closePreviousServer();

  const app = new Koa();
  const router = new koaRouter();
  registerAdminWebRoutes(router);
  app.use(router.routes());
  app.use(router.allowedMethods());

  const server = app.listen(config.port, config.listenHost);
  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    server.once('listening', onListening);
    server.once('error', onError);
  });

  (globalThis as AdminWebGlobal).__fantasyFinalAdminWebServer = server;
  const address = config.publicBaseUrl ?? `http://${config.listenHost}:${config.port}`;
  if (config.allowInsecurePublicHttp) logger.warn(`管理后台正以不安全 HTTP 公开：${address}/admin。账号、密码和会话可能被截获。`);
  else logger.info(`管理后台已启动：${address}/admin`);
};
