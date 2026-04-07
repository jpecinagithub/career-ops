import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import toast from 'react-hot-toast';

function ConfirmDialog({ message, detail, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 28, maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 20, marginBottom: 10 }}>🗑 {message}</div>
        {detail && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>{detail}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 13, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 13, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Sí, limpiar todo
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_CONFIG = {
  pending:    { color: '#f59e0b', label: 'Pendiente' },
  processing: { color: '#3b82f6', label: 'Procesando' },
  done:       { color: '#22c55e', label: 'Hecha' },
  error:      { color: '#ef4444', label: 'Error' },
  skipped:    { color: '#6b7280', label: 'Omitida' },
};

const btn = (v = 'primary', small = false) => ({
  padding: small ? '4px 10px' : '8px 16px',
  borderRadius: 6, fontWeight: 600, fontSize: small ? 11 : 13,
  background: v === 'primary' ? 'var(--cyan)' : v === 'danger' ? '#ef4444' : 'var(--bg3)',
  color: '#fff', border: v === 'primary' || v === 'danger' ? 'none' : '1px solid var(--border)',
  cursor: 'pointer',
});

function sourceTag(url = '') {
  if (url.includes('greenhouse.io')) return { label: 'Greenhouse', color: '#22c55e' };
  if (url.includes('ashbyhq.com')) return { label: 'Ashby', color: '#8b5cf6' };
  if (url.includes('lever.co')) return { label: 'Lever', color: '#f59e0b' };
  if (url.includes('workable.com')) return { label: 'Workable', color: '#3b82f6' };
  if (url.includes('linkedin.com')) return { label: 'LinkedIn', color: '#0077b5' };
  if (url.includes('indeed.com')) return { label: 'Indeed', color: '#2164f3' };
  if (url.includes('personio.com')) return { label: 'Personio', color: '#e85d04' };
  if (url.includes('adyen.com')) return { label: 'Adyen', color: '#0abf53' };
  return { label: 'Otro', color: '#6b7280' };
}

const STATUSES = ['all', 'pending', 'processing', 'done', 'error', 'skipped'];
const PAGE_SIZE = 50;

export default function Pipeline() {
  const [input, setInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const qc = useQueryClient();

  const filters = {
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data: result = { items: [], total: 0 }, isLoading } = useQuery({
    queryKey: ['pipeline', filters],
    queryFn: () => api.getPipeline(filters),
    placeholderData: keepPreviousData,
  });

  const items = result.items || [];
  const total = result.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Summary counts (unfiltered)
  const { data: allStats = { items: [], total: 0 } } = useQuery({
    queryKey: ['pipeline-stats'],
    queryFn: () => api.getPipeline({ limit: 1, offset: 0 }),
  });

  const addMut = useMutation({
    mutationFn: (urls) => api.addBatchToPipeline(urls),
    onSuccess: (r) => {
      toast.success(`Añadidas ${r.added}, omitidas ${r.skipped}`);
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['pipeline-stats'] });
      setInput('');
      setShowAdd(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.deletePipelineItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['pipeline-stats'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const clearMut = useMutation({
    mutationFn: () => api.clearPipeline(),
    onSuccess: (r) => {
      toast.success(r.message || 'Pipeline limpiado');
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['pipeline-stats'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleClearAll = () => setShowConfirm(true);

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.updatePipelineItem(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
    onError: (err) => toast.error(err.message),
  });

  const handleAdd = () => {
    const urls = input.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
    if (urls.length === 0) { toast.error('Introduce al menos una URL válida (http...)'); return; }
    addMut.mutate(urls);
  };

  const handleSearch = useCallback((e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(0);
  }, [searchInput]);

  const handleStatusFilter = (s) => {
    setStatusFilter(s);
    setPage(0);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Pipeline de Ofertas</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {total} ofertas en total · importadas desde pipeline.md + Scanner
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn()} onClick={() => setShowAdd(s => !s)}>
            {showAdd ? '✕ Cerrar' : '+ Añadir URLs'}
          </button>
          {total > 0 && (
            <button
              style={{ ...btn('danger'), background: 'transparent', border: '1px solid #ef444466', color: '#ef4444' }}
              onClick={handleClearAll}
              disabled={clearMut.isPending}
              title="Borrar todo el pipeline y reiniciar historial de scan"
            >
              🗑 Limpiar todo
            </button>
          )}
        </div>
      </div>

      {/* Add URLs panel */}
      {showAdd && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Añadir URLs al Pipeline</div>
          <textarea
            placeholder="Pega URLs aquí, una por línea&#10;https://jobs.ashbyhq.com/...&#10;https://boards.greenhouse.io/..."
            value={input} onChange={e => setInput(e.target.value)}
            style={{ minHeight: 100, resize: 'vertical', marginBottom: 10, width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={btn()} onClick={handleAdd} disabled={addMut.isPending}>
              {addMut.isPending ? '⏳ Añadiendo...' : '+ Añadir al Pipeline'}
            </button>
            <button style={btn('secondary')} onClick={() => setShowAdd(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['Total', total, 'var(--text)'],
          ['Pendientes', items.filter(i => i.status === 'pending').length, '#f59e0b'],
          ['Procesadas', items.filter(i => i.status === 'done').length, '#22c55e'],
        ].map(([label, count, color]) => (
          <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 18px', minWidth: 90 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{count}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }}>
          <input
            placeholder="Buscar empresa, rol, URL..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13 }}
          />
          <button type="submit" style={btn()}>Buscar</button>
          {search && (
            <button type="button" style={btn('secondary')} onClick={() => { setSearch(''); setSearchInput(''); setPage(0); }}>
              ✕ Limpiar
            </button>
          )}
        </form>

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => handleStatusFilter(s)}
              style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: statusFilter === s ? (s === 'all' ? 'var(--cyan)' : STATUS_CONFIG[s]?.color || 'var(--cyan)') : 'var(--bg3)',
                color: '#fff',
                border: statusFilter === s ? 'none' : '1px solid var(--border)',
                opacity: statusFilter === s ? 1 : 0.75,
              }}
            >
              {s === 'all' ? 'Todas' : STATUS_CONFIG[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Results info */}
      {(search || statusFilter !== 'all') && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {total} resultados {search && `para "${search}"`} {statusFilter !== 'all' && `· estado: ${STATUS_CONFIG[statusFilter]?.label}`}
        </div>
      )}

      {/* Offer cards */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando ofertas...</div>
      ) : items.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          {search || statusFilter !== 'all'
            ? 'No hay resultados para tu búsqueda.'
            : 'Pipeline vacío. Añade URLs o ejecuta el Scanner.'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {items.map((item, idx) => {
            const portal = sourceTag(item.url);
            const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
            return (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  padding: '14px 18px',
                  borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                }}
              >
                {/* Left: info */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    {/* Company */}
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{item.company || 'Empresa desconocida'}</span>
                    {/* Portal tag */}
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                      background: portal.color + '22', color: portal.color, border: `1px solid ${portal.color}44`,
                    }}>
                      {portal.label}
                    </span>
                    {/* Status dot */}
                    <span style={{ fontSize: 11, color: statusCfg.color, fontWeight: 500 }}>
                      ● {statusCfg.label}
                    </span>
                  </div>

                  {/* Role */}
                  <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4, fontWeight: 500 }}>
                    {item.role || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin título</span>}
                  </div>

                  {/* Location + job type row */}
                  {(item.location || item.job_type) && (
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                      {item.location && <span>📍 {item.location}</span>}
                      {item.job_type && <span>🏢 {item.job_type}</span>}
                    </div>
                  )}

                  {/* URL + date */}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: 'var(--cyan-light)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      ↗ Ver oferta
                    </a>
                    {item.source && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        fuente: {item.source}
                      </span>
                    )}
                    {item.added_at && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(item.added_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {item.status === 'pending' && (
                    <button
                      style={{ ...btn('secondary', true), color: '#22c55e', borderColor: '#22c55e44' }}
                      onClick={() => updateMut.mutate({ id: item.id, data: { status: 'done' } })}
                      title="Marcar como procesada"
                    >
                      ✓
                    </button>
                  )}
                  {item.status === 'done' && (
                    <button
                      style={{ ...btn('secondary', true), color: '#f59e0b', borderColor: '#f59e0b44' }}
                      onClick={() => updateMut.mutate({ id: item.id, data: { status: 'pending' } })}
                      title="Volver a pendiente"
                    >
                      ↩
                    </button>
                  )}
                  <button
                    style={{ ...btn('secondary', true), color: '#ef4444', borderColor: '#ef444444' }}
                    onClick={() => deleteMut.mutate(item.id)}
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button
            style={btn('secondary')}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Página {page + 1} de {totalPages} · {total} total
          </span>
          <button
            style={btn('secondary')}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Confirm dialog — styled, no native browser alert */}
      {showConfirm && (
        <ConfirmDialog
          message="Limpiar todo el pipeline"
          detail={`Se borrarán ${total} ofertas y se reiniciará el historial del scanner. Esta acción no se puede deshacer.`}
          onConfirm={() => { setShowConfirm(false); clearMut.mutate(); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
