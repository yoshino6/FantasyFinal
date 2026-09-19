import { getConfigValue } from 'alemonjs';

const boundedInteger = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};
const getAppApiServerConfig = () => {
    const raw = getConfigValue().FantasyFinal?.appApiServer ?? {};
    return {
        enabled: raw.enabled !== false,
        port: boundedInteger(raw.port, 17117, 1024, 65_535),
        listenHost: raw.listenHost === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'
    };
};

export { getAppApiServerConfig };
