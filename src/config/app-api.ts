import { getConfigValue } from 'alemonjs';

type RawAppApiConfig = {
  enabled?: boolean;
  allowInsecurePublicHttp?: boolean;
};

type AppConfig = { FantasyFinal?: { appApi?: RawAppApiConfig } };

export type AppApiConfig = {
  enabled: boolean;
  allowInsecurePublicHttp: boolean;
};

export const getAppApiConfig = (): AppApiConfig => {
  const raw = getConfigValue<AppConfig>().FantasyFinal?.appApi ?? {};
  return {
    enabled: raw.enabled !== false,
    allowInsecurePublicHttp: raw.allowInsecurePublicHttp === true
  };
};
