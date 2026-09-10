export type AdminWebConfig = {
    enabled: boolean;
    port: number;
    publicBaseUrl: string | null;
    trustedProxyIps: string[];
    sessionIdleMinutes: number;
    sessionAbsoluteMinutes: number;
    ownerBootstrapPasswordHash: string | null;
};
export declare const getAdminWebConfig: () => AdminWebConfig;
