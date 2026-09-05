import { getPool } from '../database/pool.js';
import { systemStatusSnapshot } from './system-status.service.js';

const errorText = (error) => error instanceof Error ? error.message.slice(0, 500) : '未知错误';
const runMonitoredJob = async (jobCode, action) => {
    const startedAt = Date.now();
    try {
        const result = await action();
        await (await getPool()).execute('INSERT INTO scheduled_job_runs (job_code,status,duration_ms,affected_count,finished_at) VALUES (?,\'success\',?,?,NOW())', [jobCode, Date.now() - startedAt, typeof result === 'number' ? result : null]);
        return result;
    }
    catch (error) {
        try {
            await (await getPool()).execute('INSERT INTO scheduled_job_runs (job_code,status,duration_ms,error_text,finished_at) VALUES (?,\'failed\',?,?,NOW())', [jobCode, Date.now() - startedAt, errorText(error)]);
        }
        catch { }
        throw error;
    }
};
const upsertAlert = async (ruleCode, fingerprint, severity, detail) => {
    const pool = await getPool();
    await pool.execute(`INSERT INTO monitor_alerts (rule_code,fingerprint,severity,status,detail_json,first_seen_at,last_seen_at,occurrences)
    VALUES (?,?,?,'open',?,NOW(),NOW(),1)
    ON DUPLICATE KEY UPDATE severity=VALUES(severity),status=IF(status='resolved','open',status),detail_json=VALUES(detail_json),last_seen_at=NOW(),occurrences=occurrences+1`, [ruleCode, fingerprint, severity, JSON.stringify(detail)]);
};
const evaluateMonitoring = async () => {
    const pool = await getPool();
    const startedAt = Date.now();
    await pool.query('SELECT 1');
    const dbLatencyMs = Date.now() - startedAt;
    const [failedJobs] = await pool.execute(`SELECT job_code,COUNT(*) AS failures FROM scheduled_job_runs WHERE status='failed' AND created_at>=DATE_SUB(NOW(),INTERVAL 30 MINUTE) GROUP BY job_code HAVING COUNT(*)>=2`);
    for (const job of failedJobs)
        await upsertAlert('scheduled_job_repeated_failure', String(job.job_code), 'critical', { jobCode: job.job_code, failures: Number(job.failures) });
    const [staleTravels] = await pool.execute('SELECT COUNT(*) AS total FROM player_travels WHERE arrival_at<=DATE_SUB(NOW(),INTERVAL 2 MINUTE)');
    if (Number(staleTravels[0]?.total ?? 0) > 0)
        await upsertAlert('stale_player_travel', 'global', 'warning', { total: Number(staleTravels[0].total) });
    if (dbLatencyMs > 1_500)
        await upsertAlert('database_slow', 'primary', 'warning', { dbLatencyMs });
    return { dbLatencyMs, failedJobs: failedJobs.length, staleTravels: Number(staleTravels[0]?.total ?? 0) };
};
const monitorSnapshot = async () => {
    const pool = await getPool();
    const [alerts, jobs] = await Promise.all([
        pool.execute('SELECT id,rule_code,severity,status,occurrences,last_seen_at FROM monitor_alerts WHERE status<>\'resolved\' ORDER BY FIELD(severity,\'critical\',\'warning\'),last_seen_at DESC LIMIT 20'),
        pool.execute(`SELECT r.job_code,r.status,r.finished_at,r.duration_ms,r.error_text FROM scheduled_job_runs r JOIN (SELECT job_code,MAX(id) id FROM scheduled_job_runs GROUP BY job_code) latest ON latest.id=r.id ORDER BY r.job_code`)
    ]);
    const status = await systemStatusSnapshot();
    return { status, alerts: alerts[0].map(row => ({ id: Number(row.id), rule: row.rule_code, severity: row.severity, status: row.status, occurrences: Number(row.occurrences), lastSeenAt: row.last_seen_at })), jobs: jobs[0].map(row => ({ code: row.job_code, status: row.status, finishedAt: row.finished_at, durationMs: row.duration_ms === null ? null : Number(row.duration_ms), error: row.error_text })) };
};

export { evaluateMonitoring, monitorSnapshot, runMonitoredJob };
