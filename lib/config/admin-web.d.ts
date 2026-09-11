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
export declare const getAdminWebConfig: () => AdminWebConfig;
