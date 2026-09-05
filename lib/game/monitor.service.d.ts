export declare const runMonitoredJob: <T>(jobCode: string, action: () => Promise<T>) => Promise<T>;
export declare const evaluateMonitoring: () => Promise<{
    dbLatencyMs: number;
    failedJobs: number;
    staleTravels: number;
}>;
export declare const monitorSnapshot: () => Promise<{
    status: import("./system-status.service").SystemStatusSnapshot;
    alerts: {
        id: number;
        rule: string;
        severity: string;
        status: string;
        occurrences: number;
        lastSeenAt: Date;
    }[];
    jobs: {
        code: string;
        status: string;
        finishedAt: Date;
        durationMs: number | null;
        error: string | null;
    }[];
}>;
