import { useState } from 'react';
import toast from 'react-hot-toast';

const btn = (v = 'primary') => ({
  padding: '9px 20px', borderRadius: 6, fontWeight: 600, fontSize: 13,
  background: v === 'primary' ? 'var(--cyan)' : 'var(--bg3)',
  color: '#fff', border: v === 'primary' ? 'none' : '1px solid var(--border)',
});

export default function Scanner() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);

  const addLog = (msg, type = 'info') => setLog(l => [...l, { msg, type, t: new Date().toLocaleTimeString() }]);

  const handleScan = async () => {
    setRunning(true);
    setLog([]);
    setResults([]);
    addLog('Iniciando scan de portales...', 'info');
    addLog('⚠️ El scanner completo requiere Claude Code con Playwright. Esta es una demo del frontend.', 'warn');
    addLog('Conectando con la API...', 'info');

    try {
      const res = await fetch('/health');
      const health = await res.json();
      addLog(`✅ API online (${health.timestamp})`, 'success');
      addLog('Para ejecutar el scanner completo, usa /career-ops scan en Claude Code.', 'info');
      addLog('Los resultados del último scan están en data/pipeline.md', 'info');
    } catch {
      addLog('❌ API no disponible. Asegúrate de que el servidor está corriendo.', 'error');
    }

    setRunning(false);
  };

  const logColor = { info: 'var(--text-muted)', success: '#22c55e', error: '#ef4444', warn: '#f59e0b' };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Scanner de Portales</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Escanea LinkedIn, Indeed, Glassdoor, Greenhouse, Ashby y Lever buscando ofertas de finance.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button style={btn()} onClick={handleScan} disabled={running}>
          {running ? '⏳ Escaneando...' : '🔭 Iniciar Scan'}
        </button>
        <button style={btn('secondary')} onClick={() => setLog([])}>Limpiar log</button>
      </div>

      {/* Info box */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--cyan-light)' }}>Portales configurados</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {['LinkedIn Jobs (10 queries)', 'Greenhouse API (7 empresas)', 'Ashby (5 queries)', 'Lever (2 queries)', 'Indeed NL/DE/BE/ES', 'Glassdoor EMEA', 'Workable EU', 'NGOs Bruselas', 'EuroJobs / EuroBrussels'].map(p => (
            <div key={p} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>✓ {p}</div>
          ))}
        </div>
      </div>

      {/* Log */}
      <div style={{ background: '#0a0e18', border: '1px solid var(--border)', borderRadius: 10, padding: 16, fontFamily: 'monospace', fontSize: 12, minHeight: 200, maxHeight: 400, overflowY: 'auto' }}>
        {log.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>Haz clic en "Iniciar Scan" para comenzar...</div>
        ) : log.map((l, i) => (
          <div key={i} style={{ color: logColor[l.type], marginBottom: 4 }}>
            <span style={{ color: '#4b5563' }}>[{l.t}]</span> {l.msg}
          </div>
        ))}
        {running && <div style={{ color: 'var(--cyan-light)' }}>▌</div>}
      </div>
    </div>
  );
}
