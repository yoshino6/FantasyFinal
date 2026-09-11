import { getConfigValue } from 'alemonjs';

type RawAdminWebConfig = {
  enabled?: boolean;
  port?: number;
  /** 默认仅本机监听；仅在明确允许的公网 HTTP 模式下使用 0.0.0.0。 */
  listenHost?: string;
  publicBaseUrl?: string;
  /** 明确允许 HTTP 公网直连。仅适合临时使用，账号与会话将以明文传输。 */
  allowInsecurePublicHttp?: boolean;
  trustedProxyIps?: string[];
  sessionIdleMinutes?: number;
  sessionAbsoluteMinutes?: number;
  ownerBootstrapPasswordHash?: string;
};

type AppConfig = { FantasyFinal?: { adminWeb?: RawAdminWebConfig } };

export type AdminWebConfig = {
  enabled: boolean;
  port: number;
  listenHost: '127.0.0.1' | '0.0.0.0';
  publicBaseUrl: string | null;
  allowInsecurePublicHttp: boolean;
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
 * 配置了公网地址后，默认严格校验 Host 与来自可信反向代理的 HTTPS 协议。
 * HTTP 公网直连必须同时显式开启 allowInsecurePublicHttp，避免误暴露后台。
 */
export const getAdminWebConfig = (): AdminWebConfig => {
  const raw = getConfigValue<AppConfig>().FantasyFinal?.adminWeb ?? {};
  const base = String(raw.publicBaseUrl ?? '').trim().replace(/\/$/, '');
  const allowInsecurePublicHttp = raw.allowInsecurePublicHttp === true;
  let publicBaseUrl: string | null = null;
  if (base) {
    try {
      const url = new URL(base);
      const insecureHttp = url.protocol === 'http:' && allowInsecurePublicHttp;
      if ((!insecureHttp && url.protocol !== 'https:') || !url.hostname) throw new Error('后台公网地址必须为 HTTPS URL；仅在 allowInsecurePublicHttp=true 时允许 HTTP。');
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
    listenHost: raw.listenHost === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
    publicBaseUrl,
    allowInsecurePublicHttp,
    trustedProxyIps,
    sessionIdleMinutes: boundedInteger(raw.sessionIdleMinutes, 30, 5, 720),
    sessionAbsoluteMinutes: boundedInteger(raw.sessionAbsoluteMinutes, 480, 15, 1_440),
    ownerBootstrapPasswordHash: String(raw.ownerBootstrapPasswordHash ?? '').trim() || null
  };
};
