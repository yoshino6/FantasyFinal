import { getConfigValue } from 'alemonjs';

const boundedInteger = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};
const getAdminWebConfig = () => {
    const raw = getConfigValue().FantasyFinal?.adminWeb ?? {};
    const base = String(raw.publicBaseUrl ?? '').trim().replace(/\/$/, '');
    let publicBaseUrl = null;
    if (base) {
        try {
            const url = new URL(base);
            if (url.protocol !== 'https:' || !url.hostname)
                throw new Error('后台公网地址必须为 HTTPS URL。');
            publicBaseUrl = url.toString().replace(/\/$/, '');
        }
        catch (error) {
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

export { getAdminWebConfig };
