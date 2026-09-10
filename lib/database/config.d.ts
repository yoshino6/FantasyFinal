export type DatabaseConfig = {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionLimit: number;
};
export declare const getDatabaseConfig: () => DatabaseConfig;
