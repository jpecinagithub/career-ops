import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import ScoreBadge from '../components/ScoreBadge.jsx';
import toast from 'react-hot-toast';

const STATUSES = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];

const STATUS_META = {
  Evaluated:  { color: '#6366f1', bg: '#6366f120', label: 'Evaluada' },
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
        background: meta.bg,
        color: meta.color,
        cursor: 'pointer',
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

export default function Applications() {
  const [filters, setFilters] = useState({ status: '', minScore: '', company: '' });
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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Aplicaciones</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{apps.length} registros</span>
      </div>

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
                {['#', 'Empresa', 'Rol', 'Score', 'Estado', 'Fecha', 'PDF', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin aplicaciones. Evalúa y guarda una oferta para empezar.</td></tr>
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
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{app.pdf_path ? '✅' : '❌'}</td>
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    {app.url && (
                      <a href={app.url} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--cyan-light)', textDecoration: 'none' }}>↗</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
