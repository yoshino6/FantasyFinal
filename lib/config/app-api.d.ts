export type AppApiConfig = {
    enabled: boolean;
    allowInsecurePublicHttp: boolean;
};
export declare const getAppApiConfig: () => AppApiConfig;
