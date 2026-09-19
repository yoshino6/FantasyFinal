export type AppApiServerConfig = {
    enabled: boolean;
    port: number;
    listenHost: '127.0.0.1' | '0.0.0.0';
};
export declare const getAppApiServerConfig: () => AppApiServerConfig;
