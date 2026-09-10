import { getConfigValue } from 'alemonjs';

type RawAdminWebConfig = {
  enabled?: boolean;
  port?: number;
  publicBaseUrl?: string;
  trustedProxyIps?: string[];
  sessionIdleMinutes?: number;
  sessionAbsoluteMinutes?: number;
  ownerBootstrapPasswordHash?: string;
};

type AppConfig = { FantasyFinal?: { adminWeb?: RawAdminWebConfig } };

export type AdminWebConfig = {
  enabled: boolean;
  port: number;
  publicBaseUrl: string | null;
  trustedProxyIps: string[];
  sessionIdleMinutes: number;
  sessionAbsoluteMinutes: number;
  ownerBootstrapPasswordHash: string | null;
};

const boundedInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

/**
 * 后台在没有 publicBaseUrl 时仅允许 localhost，便于首次本地初始化。
 * 配置了公网地址后，路由会严格校验 Host 与来自可信反向代理的 HTTPS 协议。
 */
export const getAdminWebConfig = (): AdminWebConfig => {
  const raw = getConfigValue<AppConfig>().FantasyFinal?.adminWeb ?? {};
  const base = String(raw.publicBaseUrl ?? '').trim().replace(/\/$/, '');
  let publicBaseUrl: string | null = null;
  if (base) {
    try {
      const url = new URL(base);
      if (url.protocol !== 'https:' || !url.hostname) throw new Error('后台公网地址必须为 HTTPS URL。');
      publicBaseUrl = url.toString().replace(/\/$/, '');
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '后台公网地址无效。');
    }
  }
  const trustedProxyIps = Array.isArray(raw.trustedProxyIps)
    ? raw.trustedProxyIps.map(value => String(value).trim()).filter(Boolean).slice(0, 16)
    : ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  return {
    enabled: raw.enabled !== false,
    port: boundedInteger(raw.port, 17118, 1024, 65_535),
    publicBaseUrl,
    trustedProxyIps,
    sessionIdleMinutes: boundedInteger(raw.sessionIdleMinutes, 30, 5, 720),
    sessionAbsoluteMinutes: boundedInteger(raw.sessionAbsoluteMinutes, 480, 15, 1_440),
    ownerBootstrapPasswordHash: String(raw.ownerBootstrapPasswordHash ?? '').trim() || null
  };
};
