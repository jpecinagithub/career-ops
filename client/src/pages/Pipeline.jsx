import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import toast from 'react-hot-toast';

const STATUS_COLORS = { pending: '#f59e0b', processing: '#3b82f6', done: '#22c55e', error: '#ef4444' };
const btn = (v = 'primary') => ({
  padding: '7px 14px', borderRadius: 6, fontWeight: 600, fontSize: 12,
  background: v === 'primary' ? 'var(--cyan)' : 'var(--bg3)',
  color: '#fff', border: v === 'primary' ? 'none' : '1px solid var(--border)',
});

export default function Pipeline() {
  const [input, setInput] = useState('');
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({ queryKey: ['pipeline'], queryFn: () => api.getPipeline() });

  const addMut = useMutation({
    mutationFn: (urls) => api.addBatchToPipeline(urls),
    onSuccess: (r) => { toast.success(`Añadidas ${r.added}, omitidas ${r.skipped}`); qc.invalidateQueries({ queryKey: ['pipeline'] }); setInput(''); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.deletePipelineItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
    onError: (err) => toast.error(err.message),
  });

  const handleAdd = () => {
    const urls = input.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
    if (urls.length === 0) { toast.error('Introduce al menos una URL válida (http...)'); return; }
    addMut.mutate(urls);
  };

  const pending = items.filter(i => i.status === 'pending');
  const done = items.filter(i => i.status === 'done');

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Pipeline de URLs</h1>

      {/* Input */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Añadir URLs</div>
        <textarea
          placeholder="Pega URLs aquí, una por línea&#10;https://jobs.ashbyhq.com/...&#10;https://boards.greenhouse.io/..."
          value={input} onChange={e => setInput(e.target.value)}
          style={{ minHeight: 100, resize: 'vertical', marginBottom: 10 }}
        />
        <button style={btn()} onClick={handleAdd}>+ Añadir al Pipeline</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        {[['Pendientes', pending.length, '#f59e0b'], ['Procesadas', done.length, '#22c55e'], ['Total', items.length, 'var(--text-muted)']].map(([label, count, color]) => (
          <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 20px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{count}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Pipeline vacío. Añade URLs para empezar.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg3)', fontSize: 12, color: 'var(--text-muted)' }}>
                {['Estado', 'Empresa', 'Rol', 'URL', 'Añadida', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ color: STATUS_COLORS[item.status] || 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
                      ● {item.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.company || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>{item.role || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>
                    <a href={item.url} target="_blank" rel="noopener" style={{ color: 'var(--cyan-light)' }}>
                      {item.url?.length > 50 ? item.url.slice(0, 50) + '...' : item.url}
                    </a>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {item.added_at ? new Date(item.added_at).toLocaleDateString('es-ES') : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => deleteMut.mutate(item.id)} style={{ ...btn('secondary'), fontSize: 11, padding: '4px 10px', color: '#ef4444' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
