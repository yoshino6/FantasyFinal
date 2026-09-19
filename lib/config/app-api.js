import { getConfigValue } from 'alemonjs';

const getAppApiConfig = () => {
    const raw = getConfigValue().FantasyFinal?.appApi ?? {};
    return {
        enabled: raw.enabled !== false,
        allowInsecurePublicHttp: raw.allowInsecurePublicHttp === true
    };
};

export { getAppApiConfig };
