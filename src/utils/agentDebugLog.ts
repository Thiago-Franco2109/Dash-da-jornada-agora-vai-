const STORAGE_KEY = 'crm_agent_debug_ca6d7f';
const ENDPOINT = 'http://127.0.0.1:7785/ingest/1959684a-0120-43d1-be63-fa25b1eaf40c';
const SESSION_ID = 'ca6d7f';

/** Debug log: localStorage backup + HTTP ingest (browser runtime evidence) */
export function agentDebugLog(payload: {
    hypothesisId: string;
    location: string;
    message: string;
    data?: Record<string, unknown>;
    runId?: string;
}): void {
    const entry = { sessionId: SESSION_ID, ...payload, timestamp: Date.now() };
    try {
        const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown[];
        logs.push(entry);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-40)));
    } catch {
        /* ignore */
    }
    if (import.meta.env.DEV) {
        console.info('[crm-debug]', entry);
    }
    fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION_ID },
        body: JSON.stringify(entry),
    }).catch(() => {});
}
