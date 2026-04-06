import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api.js';
import ScoreBadge from '../components/ScoreBadge.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import toast from 'react-hot-toast';

const STATUSES = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];
const btn = (variant = 'primary') => ({
  padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13,
  background: variant === 'primary' ? 'var(--cyan)' : 'var(--bg3)',
  color: '#fff', border: variant === 'primary' ? 'none' : '1px solid var(--border)',
});

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('report');
  const [notes, setNotes] = useState('');
  const [pdfJobId, setPdfJobId] = useState(null);
  const [pdfStatus, setPdfStatus] = useState(null);

  const { data: app, isLoading } = useQuery({
    queryKey: ['application', id],
    queryFn: () => api.getApplication(id),
    onSuccess: (data) => { if (data.notes && !notes) setNotes(data.notes); },
  });

  const updateMut = useMutation({
    mutationFn: (data) => api.updateApplication(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['application', id] });
      qc.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Actualizado');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleGeneratePdf = async () => {
    try {
      const { jobId } = await api.generatePdf(parseInt(id));
      setPdfJobId(jobId);
      setPdfStatus('pending');
      toast.success('Generando PDF...');
      // Poll status
      const poll = setInterval(async () => {
        const { status } = await api.getPdfStatus(jobId);
        setPdfStatus(status);
        if (status === 'done') {
          clearInterval(poll);
          toast.success('PDF listo');
          qc.invalidateQueries({ queryKey: ['application', id] });
        }
        if (status === 'error') { clearInterval(poll); toast.error('Error generando PDF'); }
      }, 2000);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Cargando...</div>;
  if (!app) return <div style={{ color: '#ef4444' }}>No encontrada</div>;

  const TABS = ['report', 'notes'];

  return (
    <div>
      <button onClick={() => navigate('/applications')} style={{ ...btn('secondary'), marginBottom: 20, fontSize: 12 }}>
        ← Volver
      </button>

      {/* Header */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{app.company}</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{app.role}</div>
            {app.url && <a href={app.url} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--cyan-light)', marginTop: 6, display: 'block' }}>↗ Ver oferta original</a>}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <ScoreBadge score={app.score} size="md" />
            <select
              value={app.status || 'Evaluated'}
              onChange={e => updateMut.mutate({ status: e.target.value })}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={btn()} onClick={handleGeneratePdf} disabled={pdfStatus === 'processing' || pdfStatus === 'pending'}>
            {pdfStatus === 'pending' || pdfStatus === 'processing' ? '⏳ Generando...' : '📄 Generar PDF'}
          </button>
          {pdfStatus === 'done' && pdfJobId && (
            <a href={api.getPdfDownloadUrl(pdfJobId)} download style={{ ...btn('secondary'), display: 'inline-flex', alignItems: 'center' }}>
              ⬇ Descargar PDF
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', background: 'transparent', color: tab === t ? 'var(--cyan-light)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--cyan-light)' : '2px solid transparent',
            fontSize: 13, fontWeight: tab === t ? 600 : 400,
          }}>
            {t === 'report' ? '📝 Reporte' : '🗒 Notas'}
          </button>
        ))}
      </div>

      {tab === 'report' && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
          {app.report_path ? (
            <div className="markdown">
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Reporte en: <code>{app.report_path}</code></p>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Sin reporte guardado. Usa /career-ops en Claude Code para generar uno.</p>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            style={{ width: '100%', minHeight: 200, resize: 'vertical', lineHeight: 1.6 }}
            placeholder="Notas sobre esta aplicación..."
          />
          <button style={{ ...btn(), marginTop: 10 }} onClick={() => updateMut.mutate({ notes })}>
            Guardar notas
          </button>
        </div>
      )}
    </div>
  );
}
