import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import ScoreBadge from '../components/ScoreBadge.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import toast from 'react-hot-toast';

const STATUSES = ['', 'Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];

const inp = { padding: '7px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, fontSize: 13 };

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['applications'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
    onError: (err) => toast.error(err.message),
  });

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Aplicaciones</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{apps.length} registros</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input placeholder="Buscar empresa..." value={filters.company} onChange={e => setF('company', e.target.value)} style={{ ...inp, width: 200 }} />
        <select value={filters.status} onChange={e => setF('status', e.target.value)} style={{ ...inp, width: 160 }}>
          {STATUSES.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
        </select>
        <input type="number" placeholder="Score mínimo" min="1" max="5" step="0.1" value={filters.minScore} onChange={e => setF('minScore', e.target.value)} style={{ ...inp, width: 140 }} />
        <button onClick={() => setFilters({ status: '', minScore: '', company: '' })} style={{ padding: '7px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, fontSize: 13 }}>
          Limpiar
        </button>
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
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin aplicaciones. Evalúa una oferta para empezar.</td></tr>
              ) : apps.map((app, i) => (
                <tr key={app.id} onClick={() => navigate(`/applications/${app.id}`)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{app.company}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>{app.role}</td>
                  <td style={{ padding: '10px 14px' }}><ScoreBadge score={app.score} /></td>
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    <select value={app.status || ''} onChange={e => updateMut.mutate({ id: app.id, data: { status: e.target.value } })}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
                      {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {app.created_at ? new Date(app.created_at).toLocaleDateString('es-ES') : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{app.pdf_path ? '✅' : '❌'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {app.url && <a href={app.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: 'var(--cyan-light)' }}>↗</a>}
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
