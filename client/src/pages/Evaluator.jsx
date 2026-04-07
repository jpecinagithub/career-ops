import { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { evaluateStream, api } from '../lib/api.js';
import ScoreBadge from '../components/ScoreBadge.jsx';
import toast from 'react-hot-toast';

const btn = (variant = 'primary', extra = {}) => ({
  padding: '9px 18px', borderRadius: 6, fontWeight: 600, fontSize: 13,
  background: variant === 'primary' ? 'var(--cyan)' : variant === 'success' ? '#16a34a' : 'var(--bg3)',
  color: '#fff', border: variant === 'primary' || variant === 'success' ? 'none' : '1px solid var(--border)',
  cursor: 'pointer', transition: 'opacity 0.15s',
  ...extra,
});

const inp = {
  padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)',
  color: 'var(--text)', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box',
};

function extractScore(text) {
  const m = text.match(/\*\*Score:\s*(\d+\.?\d*)\/5\*\*/i);
  return m ? parseFloat(m[1]) : null;
}

function extractMeta(text) {
  // Try: # Evaluación: Empresa — Rol
  const m = text.match(/^#\s*Evaluaci[oó]n:\s*([^—\n]+?)(?:\s*[—–-]\s*([^\n]+))?$/m);
  if (m) {
    return {
      company: m[1]?.trim() || '',
      role: m[2]?.trim() || '',
    };
  }
  // Fallback: **Empresa:** and **Rol:**
  const company = text.match(/\*\*Empresa:\*\*\s*([^\n*]+)/i)?.[1]?.trim() || '';
  const role = text.match(/\*\*Rol:\*\*\s*([^\n*]+)/i)?.[1]?.trim() || '';
  return { company, role };
}

function SaveModal({ score, url, report, onClose, onSaved }) {
  const qc = useQueryClient();
  const meta = extractMeta(report);
  const [company, setCompany] = useState(meta.company);
  const [role, setRole] = useState(meta.role);
  const [jobUrl, setJobUrl] = useState(url || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!company.trim()) { toast.error('Introduce el nombre de la empresa'); return; }
    if (!role.trim()) { toast.error('Introduce el título del puesto'); return; }
    setSaving(true);
    try {
      // 1. Save application
      const saved = await api.createApplication({
        company: company.trim(),
        role: role.trim(),
        url: jobUrl.trim() || null,
        score,
        status: 'Evaluated',
        notes: `Score: ${score}/5 — evaluada desde el panel`,
      });

      // 2. Generate PDF in background — show toast progress
      const pdfToast = toast.loading('Generando PDF del informe...');
      api.generateReportPdf({
        markdown: report,
        company: company.trim(),
        role: role.trim(),
        score,
        applicationId: saved.id,
      }).then(() => {
        toast.dismiss(pdfToast);
        toast.success('PDF generado ✅');
        qc.invalidateQueries({ queryKey: ['applications'] });
        qc.invalidateQueries({ queryKey: ['stats'] });
      }).catch(() => {
        toast.dismiss(pdfToast);
        toast.error('PDF falló — puedes regenerarlo desde aplicaciones');
      });

      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success(`✅ Guardada: ${company.trim()}`);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 28, width: 420, display: 'flex', flexDirection: 'column', gap: 16,
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Guardar evaluación</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {score != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Score detectado:</span>
            <ScoreBadge score={score} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>EMPRESA *</label>
          <input style={inp} value={company} onChange={e => setCompany(e.target.value)} placeholder="Ej: Adyen" autoFocus />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>PUESTO *</label>
          <input style={inp} value={role} onChange={e => setRole(e.target.value)} placeholder="Ej: FP&A Manager" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>URL DE LA OFERTA</label>
          <input style={inp} value={jobUrl} onChange={e => setJobUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button style={btn('secondary')} onClick={onClose}>Cancelar</button>
          <button style={btn('success')} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : '💾 Guardar en aplicaciones'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Evaluator() {
  const [jdText, setJdText] = useState('');
  const [url, setUrl] = useState('');
  const [report, setReport] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const abortRef = useRef(null);
  const reportRef = useRef('');
  const qc = useQueryClient();

  const score = done ? extractScore(report) : null;

  const handleEvaluate = useCallback(() => {
    if (!jdText.trim()) { toast.error('Pega el texto del JD primero'); return; }
    setReport('');
    reportRef.current = '';
    setDone(false);
    setSaved(false);
    setStreaming(true);

    abortRef.current = evaluateStream(
      jdText,
      (chunk) => {
        reportRef.current += chunk;
        setReport(prev => prev + chunk);
      },
      () => {
        setStreaming(false);
        setDone(true);
      },
      (err) => { setStreaming(false); toast.error(`Error: ${err.message}`); }
    );
  }, [jdText]);

  const handleStop = () => { abortRef.current?.(); setStreaming(false); setDone(true); };
  const handleClear = () => { setJdText(''); setUrl(''); setReport(''); setDone(false); setSaved(false); };

  const handleAddPipeline = async () => {
    if (!url) { toast.error('Introduce la URL para añadir al pipeline'); return; }
    try {
      await api.addToPipeline({ url, status: 'done' });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      toast.success('Añadida al pipeline');
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Evaluar Oferta</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, height: 'calc(100vh - 140px)' }}>
        {/* Left: Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            placeholder="URL de la oferta (opcional)"
            value={url} onChange={e => setUrl(e.target.value)}
            style={{ flexShrink: 0 }}
          />
          <textarea
            placeholder="Pega aquí el texto completo del JD (Job Description)..."
            value={jdText} onChange={e => setJdText(e.target.value)}
            style={{ flex: 1, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <button style={btn()} onClick={handleEvaluate} disabled={streaming}>
              {streaming ? '⏳ Evaluando...' : '🔍 Evaluar'}
            </button>
            {streaming && (
              <button style={btn('secondary')} onClick={handleStop}>⏹ Parar</button>
            )}
            {done && !saved && (
              <button style={btn('success')} onClick={() => setShowSaveModal(true)}>
                💾 Guardar
              </button>
            )}
            {saved && (
              <span style={{ padding: '9px 14px', fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                ✅ Guardada
              </span>
            )}
            {done && url && (
              <button style={btn('secondary')} onClick={handleAddPipeline}>📥 Pipeline</button>
            )}
            <button style={btn('secondary')} onClick={handleClear}>🗑 Limpiar</button>
          </div>
        </div>

        {/* Right: Result */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 20, overflowY: 'auto', position: 'relative',
        }}>
          {!report && !streaming && (
            <div style={{ color: 'var(--text-muted)', padding: '60px 0', textAlign: 'center' }}>
              El reporte aparecerá aquí mientras el LLM evalúa...
            </div>
          )}
          {score != null && (
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 600 }}>Score:</span>
              <ScoreBadge score={score} size="lg" />
            </div>
          )}
          {report && (
            <div className="markdown">
              <ReactMarkdown>{report}</ReactMarkdown>
            </div>
          )}
          {streaming && (
            <div style={{ display: 'inline-block', width: 8, height: 16, background: 'var(--cyan-light)', animation: 'blink 1s infinite', borderRadius: 1 }} />
          )}
        </div>
      </div>

      {showSaveModal && (
        <SaveModal
          score={score}
          url={url}
          report={report}
          onClose={() => setShowSaveModal(false)}
          onSaved={() => { setShowSaveModal(false); setSaved(true); }}
        />
      )}

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}
