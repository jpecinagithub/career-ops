const BASE = '/api';

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Applications
  getApplications: (filters = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null));
    return req('GET', `/applications?${params}`);
  },
  getApplication: (id) => req('GET', `/applications/${id}`),
  createApplication: (data) => req('POST', '/applications', data),
  updateApplication: (id, data) => req('PATCH', `/applications/${id}`, data),
  deleteApplication: (id) => req('DELETE', `/applications/${id}`),
  getStats: () => req('GET', '/stats'),

  // Pipeline
  getPipeline: (status) => req('GET', status ? `/pipeline?status=${status}` : '/pipeline'),
  addToPipeline: (data) => req('POST', '/pipeline', data),
  addBatchToPipeline: (urls) => req('POST', '/pipeline/batch', { urls }),
  updatePipelineItem: (id, data) => req('PATCH', `/pipeline/${id}`, data),
  deletePipelineItem: (id) => req('DELETE', `/pipeline/${id}`),

  // CV & Profile
  getCV: () => req('GET', '/cv'),
  updateCV: (content) => req('PUT', '/cv', { content }),
  getProfile: () => req('GET', '/cv/profile'),
  updateProfile: (data) => req('PUT', '/cv/profile', data),

  // PDF
  generatePdf: (applicationId, customHtml) => req('POST', '/pdf/generate', { applicationId, customHtml }),
  getPdfStatus: (jobId) => req('GET', `/pdf/status/${jobId}`),
  getPdfDownloadUrl: (jobId) => `/api/pdf/download/${jobId}`,

  // Evaluate (non-streaming)
  evaluate: (jdText, url) => req('POST', '/evaluate', { jdText, url }),

  // Health
  health: () => fetch('/health').then(r => r.json()),
};

// SSE-based streaming evaluate
export function evaluateStream(jdText, onChunk, onDone, onError) {
  const controller = new AbortController();

  fetch(`${BASE}/evaluate/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jdText }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') { onDone?.(); return; }
        try {
          const parsed = JSON.parse(data);
          if (parsed.chunk) onChunk(parsed.chunk);
          if (parsed.error) onError?.(new Error(parsed.error));
        } catch {}
      }
    }
    onDone?.();
  }).catch((err) => {
    if (err.name !== 'AbortError') onError?.(err);
  });

  return () => controller.abort();
}
