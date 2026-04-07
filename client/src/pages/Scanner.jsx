import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const btn = (v = 'primary', disabled = false) => ({
  padding: '9px 20px', borderRadius: 6, fontWeight: 600, fontSize: 13,
  background: disabled ? 'var(--bg3)' : v === 'primary' ? 'var(--cyan)' : 'var(--bg3)',
  color: disabled ? 'var(--text-muted)' : '#fff',
  border: v === 'primary' ? 'none' : '1px solid var(--border)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
});

const LOG_COLORS = {
  log: 'var(--text-muted)',
  start: 'var(--cyan-light)',
  result: '#22c55e',
  error: '#ef4444',
  done: '#f59e0b',
};

export default function Scanner() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const abortRef = useRef(null);
  const logRef = useRef(null);
  const qc = useQueryClient();

  const addLog = (msg, type = 'log') => {
    setLog(l => {
      const next = [...l, { msg, type, t: new Date().toLocaleTimeString() }];
      // auto-scroll
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      }, 50);
      return next;
    });
  };

  const handleScan = () => {
    setRunning(true);
    setLog([]);
    setResults([]);
    setSummary(null);

    const controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/scan', { method: 'POST', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              handleEvent(event);
            } catch {}
          }
        }
        setRunning(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          addLog(`Error: ${err.message}`, 'error');
          toast.error(err.message);
        }
        setRunning(false);
      });
  };

  const handleEvent = (event) => {
    switch (event.type) {
      case 'start':
        addLog(event.msg, 'start');
        break;
      case 'log':
        addLog(event.msg, 'log');
        break;
      case 'result':
        addLog(`✅ NUEVA: ${event.offer.company} | ${event.offer.title}`, 'result');
        setResults(r => [...r, event.offer]);
        break;
      case 'done':
        setSummary(event.summary);
        addLog(`\n✅ Scan completado: ${event.summary.added} nuevas ofertas añadidas`, 'done');
        qc.invalidateQueries({ queryKey: ['pipeline'] });
        qc.invalidateQueries({ queryKey: ['pipeline-stats'] });
        toast.success(`Scan completado: ${event.summary.added} nuevas ofertas`);
        break;
      case 'error':
        addLog(`Error: ${event.msg}`, 'error');
        toast.error(event.msg);
        break;
      case 'complete':
        setRunning(false);
        break;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    addLog('⏹ Scan detenido por el usuario', 'log');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Scanner de Portales</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Escanea LinkedIn, Indeed, Glassdoor, Greenhouse, Ashby y Lever. Las ofertas nuevas van al Pipeline.
          </p>
        </div>
      </div>

      {/* Summary cards (post-scan) */}
      {summary && (
        <div style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
          {[
            ['Encontradas', summary.totalFound, 'var(--text)'],
            ['Antiguas (+14d)', summary.tooOld ?? 0, '#f59e0b'],
            ['Filtradas', summary.filtered, 'var(--text-muted)'],
            ['Duplicadas', summary.duplicated, 'var(--text-muted)'],
            ['Nuevas', summary.added, '#22c55e'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 18px', minWidth: 100 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button style={btn('primary', running)} onClick={handleScan} disabled={running}>
          {running ? '⏳ Escaneando...' : '🔭 Iniciar Scan'}
        </button>
        {running && <button style={btn('secondary')} onClick={handleStop}>⏹ Parar</button>}
        {!running && log.length > 0 && (
          <button style={btn('secondary')} onClick={() => { setLog([]); setResults([]); setSummary(null); }}>
            🗑 Limpiar
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Log terminal */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Log del scan</div>
          <div
            ref={logRef}
            style={{
              background: '#0a0e18', border: '1px solid var(--border)', borderRadius: 10,
              padding: 14, fontFamily: 'monospace', fontSize: 12,
              minHeight: 350, maxHeight: 500, overflowY: 'auto',
            }}
          >
            {log.length === 0 ? (
              <div style={{ color: '#374151' }}>Haz clic en "Iniciar Scan" para comenzar...</div>
            ) : log.map((l, i) => (
              <div key={i} style={{ color: LOG_COLORS[l.type] || 'var(--text-muted)', marginBottom: 3, lineHeight: 1.5 }}>
                <span style={{ color: '#374151' }}>[{l.t}]</span> {l.msg}
              </div>
            ))}
            {running && <div style={{ color: 'var(--cyan-light)', marginTop: 4 }}>▌</div>}
          </div>
        </div>

        {/* New results */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            Nuevas ofertas encontradas ({results.length})
          </div>
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
            minHeight: 350, maxHeight: 500, overflowY: 'auto',
          }}>
            {results.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
                Las nuevas ofertas aparecerán aquí durante el scan
              </div>
            ) : results.map((offer, i) => (
              <div key={i} style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{offer.company}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{offer.title}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <a href={offer.url} target="_blank" rel="noopener"
                    style={{ fontSize: 11, color: 'var(--cyan-light)' }}>
                    ↗ Ver oferta
                  </a>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>
                    {offer.source?.split(' — ')[0] || 'scan'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Portals info */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginTop: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Portales configurados en portals.yml</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            'LinkedIn (10 queries)',
            'Greenhouse API (7 empresas)',
            'Ashby (2 queries)',
            'Lever (1 query)',
            'Indeed NL/DE/BE/ES',
            'Glassdoor EMEA',
            'Workable EU',
            'NGOs Bruselas',
            'EuroJobs',
            'EuroBrussels',
            'TravelPerk · Factorial',
            'Dufry · Anthropic · Intercom',
          ].map(p => (
            <div key={p} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '7px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
              ✓ {p}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
