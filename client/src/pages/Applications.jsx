import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import ScoreBadge from '../components/ScoreBadge.jsx';
import toast from 'react-hot-toast';

const STATUSES = ['Evaluated', 'Selected', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];

const STATUS_META = {
  Evaluated:  { color: '#6366f1', bg: '#6366f120', label: 'Evaluada' },
  Selected:   { color: '#f97316', bg: '#f9731620', label: 'Seleccionada' },
  Applied:    { color: '#0ea5e9', bg: '#0ea5e920', label: 'Aplicada' },
  Responded:  { color: '#f59e0b', bg: '#f59e0b20', label: 'Respondió' },
  Interview:  { color: '#8b5cf6', bg: '#8b5cf620', label: 'Entrevista' },
  Offer:      { color: '#10b981', bg: '#10b98120', label: 'Oferta' },
  Rejected:   { color: '#ef4444', bg: '#ef444420', label: 'Rechazada' },
  Discarded:  { color: '#6b7280', bg: '#6b728020', label: 'Descartada' },
  SKIP:       { color: '#6b7280', bg: '#6b728020', label: 'Skip' },
};

const inp = { padding: '7px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, fontSize: 13 };

function StatusSelect({ value, onChange, disabled }) {
  const meta = STATUS_META[value] || STATUS_META['Evaluated'];
  return (
    <select
      value={value || 'Evaluated'}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        padding: '4px 8px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        border: `1px solid ${meta.color}40`,
        backgroundColor: meta.bg,
        color: meta.color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        paddingRight: 22,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='${encodeURIComponent(meta.color)}'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 7px center',
        minWidth: 110,
      }}
    >
      {STATUSES.map(s => (
        <option key={s} value={s} style={{ background: 'var(--bg2)', color: 'var(--text)', fontWeight: 400 }}>
          {STATUS_META[s]?.label || s}
        </option>
      ))}
    </select>
  );
}

function DeleteButton({ app, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const qc = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: () => api.deleteApplication(app.id),
    onSuccess: () => {
      toast.success(`Eliminada: ${app.company}`);
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      onDeleted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  if (confirming) {
    return (
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          onClick={() => deleteMut.mutate()}
          disabled={deleteMut.isPending}
          style={{
            padding: '3px 8px', fontSize: 11, fontWeight: 700,
            background: '#ef4444', color: '#fff', border: 'none',
            borderRadius: 4, cursor: 'pointer',
          }}
        >
          {deleteMut.isPending ? '...' : 'Sí'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={{
            padding: '3px 8px', fontSize: 11,
            background: 'var(--bg3)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
          }}
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Eliminar aplicación y PDF"
      style={{
        padding: '3px 7px', fontSize: 13, lineHeight: 1,
        background: 'transparent', color: 'var(--text-muted)',
        border: '1px solid transparent', borderRadius: 4,
        cursor: 'pointer', opacity: 0.5,
        transition: 'opacity 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = '#ef4444'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      🗑
    </button>
  );
}

function CvGenModal({ app, onClose, onDone }) {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const abortRef = useRef(null);
  const qc = useQueryClient();

  const start = () => {
    setRunning(true);
    setLog([{ text: `🚀 Generating tailored CV & Cover Letter for ${app.company}...`, color: 'var(--cyan-light)' }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch(`/api/cvgen/${app.id}`, { method: 'POST', signal: ctrl.signal })
      .then(async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done: d, value } = await reader.read();
          if (d) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === 'log') {
                setLog(l => [...l, { text: ev.msg, color: 'var(--text-muted)' }]);
              } else if (ev.type === 'done') {
                setLog(l => [...l, { text: '✅ Done! CV and Cover Letter are ready.', color: '#10b981', bold: true }]);
                setRunning(false);
                setDone(true);
                qc.invalidateQueries({ queryKey: ['applications'] });
                toast.success('CV & Cover Letter generados ✅');
                onDone?.();
              } else if (ev.type === 'error') {
                setLog(l => [...l, { text: `❌ Error: ${ev.msg}`, color: '#ef4444' }]);
                setRunning(false);
              }
            } catch {}
          }
        }
        setRunning(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setLog(l => [...l, { text: `❌ ${err.message}`, color: '#ef4444' }]);
          toast.error(err.message);
        }
        setRunning(false);
      });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 500, display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Generar CV & Cover Letter</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{app.company} — {app.role}</div>
          </div>
          <button onClick={() => { abortRef.current?.abort(); onClose(); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {!running && !done && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            La IA generará un <strong style={{ color: 'var(--text)' }}>CV personalizado</strong> y una <strong style={{ color: 'var(--text)' }}>carta de presentación</strong> ajustados a los requisitos de esta oferta.
            <br /><br />
            Tiempo estimado: <strong style={{ color: 'var(--text)' }}>~1 minuto</strong>
          </div>
        )}

        {log.length > 0 && (
          <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8, background: 'var(--bg)', borderRadius: 6, padding: '10px 14px', maxHeight: 180, overflowY: 'auto' }}>
            {log.map((e, i) => (
              <div key={i} style={{ color: e.color, fontWeight: e.bold ? 700 : 400 }}>{e.text}</div>
            ))}
            {running && <span style={{ display: 'inline-block', width: 8, height: 12, background: 'var(--cyan)', animation: 'blink 1s infinite', borderRadius: 1 }} />}
          </div>
        )}

        {done && (
          <div style={{ display: 'flex', gap: 10 }}>
            <a href={api.getCvUrl(app.id)} target="_blank" rel="noopener" style={{ flex: 1, padding: '9px 0', textAlign: 'center', background: '#1d4ed8', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              📄 Abrir CV
            </a>
            <a href={api.getCoverLetterUrl(app.id)} target="_blank" rel="noopener" style={{ flex: 1, padding: '9px 0', textAlign: 'center', background: '#7c3aed', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              ✉️ Abrir Cover Letter
            </a>
          </div>
        )}

        {!running && !done && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '9px 18px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={start} style={{ padding: '9px 18px', background: '#7c3aed', border: 'none', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              🤖 Generar
            </button>
          </div>
        )}

        <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
      </div>
    </div>
  );
}

export default function Applications() {
  const [filters, setFilters] = useState({ status: '', minScore: '', company: '' });
  const [cvGenApp, setCvGenApp] = useState(null);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkLog, setBulkLog] = useState([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkStats, setBulkStats] = useState(null);
  const bulkAbortRef = useRef(null);
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [applyLog, setApplyLog] = useState([]);
  const [applyRunning, setApplyRunning] = useState(false);
  const [applyStats, setApplyStats] = useState(null);
  const applyAbortRef = useRef(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['applications', filters],
    queryFn: () => api.getApplications({
      status: filters.status || undefined,
      minScore: filters.minScore || undefined,
      company: filters.company || undefined,
    }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.updateApplication(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleStatusChange = (app, newStatus) => {
    updateMut.mutate(
      { id: app.id, data: { status: newStatus } },
      { onSuccess: () => toast.success(`${app.company} → ${STATUS_META[newStatus]?.label || newStatus}`) }
    );
  };

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const handleBulkGenerate = () => {
    setShowBulkPanel(true);
    setBulkRunning(true);
    setBulkLog([{ text: 'Iniciando generación en bulk...', color: '#7c3aed' }]);
    setBulkStats(null);

    const ctrl = new AbortController();
    bulkAbortRef.current = ctrl;

    fetch('/api/cvgen/bulk', { method: 'POST', signal: ctrl.signal })
      .then(async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === 'start') {
                setBulkLog([{ text: `Generando CV para ${ev.total} aplicaciones...`, color: '#7c3aed' }]);
              } else if (ev.type === 'item_start') {
                setBulkLog(l => [...l, { text: `\n[${ev.current}/${ev.total}] ${ev.company} — ${ev.role}`, color: 'var(--text)', bold: true }]);
              } else if (ev.type === 'log') {
                setBulkLog(l => [...l, { text: `  ${ev.msg}`, color: 'var(--text-muted)' }]);
              } else if (ev.type === 'done') {
                setBulkLog(l => [...l, { text: '  CV y Cover Letter generados', color: '#10b981' }]);
                qc.invalidateQueries({ queryKey: ['applications'] });
              } else if (ev.type === 'item_error') {
                setBulkLog(l => [...l, { text: `  Error: ${ev.error}`, color: '#ef4444' }]);
              } else if (ev.type === 'progress') {
                setBulkStats({ done: ev.done, errors: ev.errors, total: ev.total });
              } else if (ev.type === 'complete') {
                setBulkStats({ done: ev.done, errors: ev.errors, total: ev.total });
                setBulkLog(l => [...l, { text: `\nCompletado: ${ev.done} CVs generados, ${ev.errors} errores`, color: '#10b981', bold: true }]);
                setBulkRunning(false);
                qc.invalidateQueries({ queryKey: ['applications'] });
                toast.success(`${ev.done} CVs generados`);
              } else if (ev.type === 'error') {
                setBulkLog(l => [...l, { text: `Error: ${ev.msg}`, color: '#ef4444' }]);
                setBulkRunning(false);
              }
            } catch {}
          }
        }
        setBulkRunning(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') toast.error(err.message);
        setBulkRunning(false);
      });
  };

  const handleBulkApply = () => {
    setShowApplyPanel(true);
    setApplyRunning(true);
    setApplyLog([{ text: 'Iniciando envío automático de aplicaciones...', color: '#0ea5e9' }]);
    setApplyStats(null);

    const ctrl = new AbortController();
    applyAbortRef.current = ctrl;

    fetch('/api/apply/all', { method: 'POST', signal: ctrl.signal })
      .then(async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === 'start') {
                setApplyLog([{ text: `Aplicando a ${ev.total} ofertas seleccionadas...`, color: '#0ea5e9' }]);
              } else if (ev.type === 'item_start') {
                setApplyLog(l => [...l, { text: `\n[${ev.current}/${ev.total}] ${ev.company} — ${ev.role}`, color: 'var(--text)', bold: true }]);
              } else if (ev.type === 'log') {
                setApplyLog(l => [...l, { text: `  ${ev.msg}`, color: 'var(--text-muted)' }]);
              } else if (ev.type === 'applied') {
                setApplyLog(l => [...l, { text: `  ✅ Aplicación enviada`, color: '#10b981' }]);
                qc.invalidateQueries({ queryKey: ['applications'] });
              } else if (ev.type === 'login_required') {
                setApplyLog(l => [...l, { text: `  ⚠️ Requiere login — omitida`, color: '#f59e0b' }]);
              } else if (ev.type === 'item_error') {
                setApplyLog(l => [...l, { text: `  ❌ Error: ${ev.error}`, color: '#ef4444' }]);
              } else if (ev.type === 'progress') {
                setApplyStats({ done: ev.done, errors: ev.errors, total: ev.total });
              } else if (ev.type === 'complete') {
                setApplyStats({ done: ev.done, errors: ev.errors, total: ev.total });
                setApplyLog(l => [...l, { text: `\nCompletado: ${ev.done} aplicaciones enviadas, ${ev.errors} errores`, color: '#10b981', bold: true }]);
                setApplyRunning(false);
                qc.invalidateQueries({ queryKey: ['applications'] });
                toast.success(`${ev.done} aplicaciones enviadas`);
              } else if (ev.type === 'error') {
                setApplyLog(l => [...l, { text: `Error: ${ev.msg}`, color: '#ef4444' }]);
                setApplyRunning(false);
              }
            } catch {}
          }
        }
        setApplyRunning(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') toast.error(err.message);
        setApplyRunning(false);
      });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Aplicaciones</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {apps.some(a => !a.cv_path) && (
            <button
              onClick={handleBulkGenerate}
              disabled={bulkRunning}
              style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: bulkRunning ? 'var(--bg3)' : '#7c3aed', color: '#fff', border: 'none', cursor: bulkRunning ? 'not-allowed' : 'pointer' }}
            >
              {bulkRunning ? '⏳ Generando...' : '🤖 Generar CV para todas'}
            </button>
          )}
          {apps.some(a => a.status === 'Selected' && a.cv_path && a.cover_letter_path) && (
            <button
              onClick={handleBulkApply}
              disabled={applyRunning}
              style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: applyRunning ? 'var(--bg3)' : '#0ea5e9', color: '#fff', border: 'none', cursor: applyRunning ? 'not-allowed' : 'pointer' }}
            >
              {applyRunning ? '⏳ Aplicando...' : '🚀 Aplicar seleccionadas'}
            </button>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{apps.length} registros</span>
        </div>
      </div>

      {/* Bulk CV generation panel */}
      {showBulkPanel && (
        <div style={{ background: 'var(--bg2)', border: `1px solid ${bulkRunning ? '#7c3aed44' : 'var(--border)'}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: bulkRunning ? '#7c3aed' : '#10b981' }}>
              {bulkRunning ? '⏳ Generando CVs...' : '✅ Generación completada'}
            </span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {bulkStats && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {bulkStats.done}/{bulkStats.total} completados {bulkStats.errors > 0 && `· ${bulkStats.errors} errores`}
                </span>
              )}
              {bulkStats && bulkStats.total > 0 && (
                <div style={{ width: 100, height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#10b981', borderRadius: 3, transition: 'width 0.3s', width: `${Math.round(((bulkStats.done + bulkStats.errors) / bulkStats.total) * 100)}%` }} />
                </div>
              )}
              {!bulkRunning && (
                <button onClick={() => setShowBulkPanel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
              )}
            </div>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.7, background: 'var(--bg)', borderRadius: 6, padding: '8px 12px', maxHeight: 220, overflowY: 'auto' }}>
            {bulkLog.map((e, i) => (
              <div key={i} style={{ color: e.color, fontWeight: e.bold ? 700 : 400, whiteSpace: 'pre-wrap' }}>{e.text}</div>
            ))}
            {bulkRunning && <span style={{ display: 'inline-block', width: 7, height: 11, background: '#7c3aed', animation: 'blink 1s infinite', borderRadius: 1 }} />}
          </div>
        </div>
      )}

      {/* Apply panel */}
      {showApplyPanel && (
        <div style={{ background: 'var(--bg2)', border: `1px solid ${applyRunning ? '#0ea5e944' : 'var(--border)'}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: applyRunning ? '#0ea5e9' : '#10b981' }}>
              {applyRunning ? '⏳ Enviando aplicaciones...' : '✅ Proceso completado'}
            </span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {applyStats && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {applyStats.done}/{applyStats.total} enviadas {applyStats.errors > 0 && `· ${applyStats.errors} errores`}
                </span>
              )}
              {applyStats && applyStats.total > 0 && (
                <div style={{ width: 100, height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#0ea5e9', borderRadius: 3, transition: 'width 0.3s', width: `${Math.round(((applyStats.done + applyStats.errors) / applyStats.total) * 100)}%` }} />
                </div>
              )}
              {!applyRunning && (
                <button onClick={() => setShowApplyPanel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
              )}
            </div>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.7, background: 'var(--bg)', borderRadius: 6, padding: '8px 12px', maxHeight: 220, overflowY: 'auto' }}>
            {applyLog.map((e, i) => (
              <div key={i} style={{ color: e.color, fontWeight: e.bold ? 700 : 400, whiteSpace: 'pre-wrap' }}>{e.text}</div>
            ))}
            {applyRunning && <span style={{ display: 'inline-block', width: 7, height: 11, background: '#0ea5e9', animation: 'blink 1s infinite', borderRadius: 1 }} />}
          </div>
        </div>
      )}

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="Buscar empresa..." value={filters.company} onChange={e => setF('company', e.target.value)} style={{ ...inp, width: 200 }} />
        <select value={filters.status} onChange={e => setF('status', e.target.value)} style={{ ...inp, width: 160 }}>
          <option value=''>Todos los estados</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
        </select>
        <input type="number" placeholder="Score mínimo" min="1" max="5" step="0.1" value={filters.minScore} onChange={e => setF('minScore', e.target.value)} style={{ ...inp, width: 140 }} />
        <button onClick={() => setFilters({ status: '', minScore: '', company: '' })} style={{ padding: '7px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
          Limpiar
        </button>
      </div>

      {/* Status legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUSES.map(s => {
          const meta = STATUS_META[s];
          const count = apps.filter(a => a.status === s).length;
          if (count === 0) return null;
          return (
            <span key={s} onClick={() => setF('status', filters.status === s ? '' : s)} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: meta.bg, color: meta.color, border: `1px solid ${meta.color}40`,
              cursor: 'pointer', userSelect: 'none',
              opacity: filters.status && filters.status !== s ? 0.4 : 1,
            }}>
              {meta.label} {count}
            </span>
          );
        })}
      </div>

      {/* Table */}
      {isLoading ? <div style={{ color: 'var(--text-muted)' }}>Cargando...</div> : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg3)', fontSize: 12, color: 'var(--text-muted)' }}>
                {['#', 'Empresa', 'Rol', 'Score', 'Estado', 'Fecha', 'Docs', 'CV', 'CL', '', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin aplicaciones. Evalúa y guarda una oferta para empezar.</td></tr>
              ) : apps.map((app, i) => (
                <tr key={app.id}
                  onClick={() => navigate(`/applications/${app.id}`)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{app.company}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.role}</td>
                  <td style={{ padding: '10px 14px' }}><ScoreBadge score={app.score} /></td>

                  {/* Status — click stops row navigation */}
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    <StatusSelect
                      value={app.status}
                      onChange={(newStatus) => handleStatusChange(app, newStatus)}
                      disabled={updateMut.isPending}
                    />
                  </td>

                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {app.created_at ? new Date(app.created_at).toLocaleDateString('es-ES') : '—'}
                  </td>

                  {/* Docs: Report PDF */}
                  <td style={{ padding: '10px 10px', fontSize: 14 }} onClick={e => e.stopPropagation()}>
                    {app.pdf_path ? (
                      <a href={api.getPdfOpenUrl(app.id)} target="_blank" rel="noopener" title="Ver informe de evaluación" style={{ textDecoration: 'none' }}>📊</a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                    )}
                  </td>

                  {/* CV PDF */}
                  <td style={{ padding: '10px 10px', fontSize: 14 }} onClick={e => e.stopPropagation()}>
                    {app.cv_path ? (
                      <a href={api.getCvUrl(app.id)} target="_blank" rel="noopener" title="Ver CV personalizado" style={{ textDecoration: 'none' }}>📄</a>
                    ) : (
                      <button
                        onClick={() => setCvGenApp(app)}
                        title="Generar CV & Cover Letter"
                        style={{ background: 'none', border: '1px solid #7c3aed44', borderRadius: 4, color: '#7c3aed', fontSize: 11, padding: '2px 6px', cursor: 'pointer', opacity: 0.6, transition: 'opacity 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
                      >
                        +CV
                      </button>
                    )}
                  </td>

                  {/* Cover Letter PDF */}
                  <td style={{ padding: '10px 10px', fontSize: 14 }} onClick={e => e.stopPropagation()}>
                    {app.cover_letter_path ? (
                      <a href={api.getCoverLetterUrl(app.id)} target="_blank" rel="noopener" title="Ver cover letter" style={{ textDecoration: 'none' }}>✉️</a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                    )}
                  </td>

                  {/* Offer URL */}
                  <td style={{ padding: '10px 10px' }} onClick={e => e.stopPropagation()}>
                    {app.url && (
                      <a href={app.url} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--cyan-light)', textDecoration: 'none' }}>↗</a>
                    )}
                  </td>

                  {/* Delete */}
                  <td style={{ padding: '6px 8px' }} onClick={e => e.stopPropagation()}>
                    <DeleteButton app={app} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cvGenApp && (
        <CvGenModal
          app={cvGenApp}
          onClose={() => setCvGenApp(null)}
          onDone={() => setCvGenApp(null)}
        />
      )}
    </div>
  );
}
