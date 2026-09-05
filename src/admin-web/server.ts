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

  const server = app.listen(config.port, '127.0.0.1');
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
  logger.info(`管理后台已启动：http://127.0.0.1:${config.port}/admin`);
};
