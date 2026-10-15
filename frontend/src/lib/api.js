/*
 * API client. The dashboard runs on the built-in demo engine (src/lib/engine.js),
 * which mirrors the FastAPI backend's logic. When VITE_API_URL is set, this
 * client talks to the backend instead (see backend/app/main.py for endpoints).
 */
const BASE = (import.meta.env && import.meta.env.VITE_API_URL) || '';

async function request(path, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || body?.detail || `HTTP ${res.status}`);
    return body;
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Backend did not respond within 6 s' : e.message);
  } finally { clearTimeout(timer); }
}

export const api = {
  configured: !!BASE,
  baseUrl: BASE,
  health: () => request('/api/health'),
  units: () => request('/api/units'),
  risk: (unitId, horizon = 30) => request(`/api/units/${encodeURIComponent(unitId)}/risk?horizon=${horizon}`),
  forecast: (unitId, horizon = 30) => request(`/api/units/${encodeURIComponent(unitId)}/forecast?horizon=${horizon}`),
  alerts: () => request('/api/alerts'),
  patchAlert: (id, body) => request(`/api/alerts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addAction: (id, body) => request(`/api/alerts/${encodeURIComponent(id)}/actions`, { method: 'POST', body: JSON.stringify(body) }),
  scenarios: () => request('/api/scenarios'),
  runScenario: (body) => request('/api/scenarios/run', { method: 'POST', body: JSON.stringify(body) }),
};
