import { getConfigValue } from 'alemonjs';

type RawAppApiServerConfig = {
  enabled?: boolean;
  port?: number;
  listenHost?: '127.0.0.1' | '0.0.0.0';
};

type AppConfig = { FantasyFinal?: { appApiServer?: RawAppApiServerConfig } };

export type AppApiServerConfig = {
  enabled: boolean;
  port: number;
  listenHost: '127.0.0.1' | '0.0.0.0';
};

const boundedInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

export const getAppApiServerConfig = (): AppApiServerConfig => {
  const raw = getConfigValue<AppConfig>().FantasyFinal?.appApiServer ?? {};
  return {
    enabled: raw.enabled !== false,
    port: boundedInteger(raw.port, 17117, 1024, 65_535),
    listenHost: raw.listenHost === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'
  };
};
