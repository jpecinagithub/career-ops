import { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { evaluateStream, api } from '../lib/api.js';
import ScoreBadge from '../components/ScoreBadge.jsx';
import toast from 'react-hot-toast';

const btn = (variant = 'primary') => ({
  padding: '9px 18px', borderRadius: 6, fontWeight: 600, fontSize: 13,
  background: variant === 'primary' ? 'var(--cyan)' : 'var(--bg3)',
  color: '#fff', border: variant === 'primary' ? 'none' : '1px solid var(--border)',
  opacity: 1, transition: 'opacity 0.15s',
});

function extractScore(text) {
  const m = text.match(/\*\*Score:\s*(\d+\.?\d*)\/5\*\*/i);
  return m ? parseFloat(m[1]) : null;
}

export default function Evaluator() {
  const [jdText, setJdText] = useState('');
  const [url, setUrl] = useState('');
  const [report, setReport] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const abortRef = useRef(null);
  const qc = useQueryClient();

  const score = done ? extractScore(report) : null;

  const handleEvaluate = useCallback(() => {
    if (!jdText.trim()) { toast.error('Pega el texto del JD primero'); return; }
    setReport('');
    setDone(false);
    setStreaming(true);

    abortRef.current = evaluateStream(
      jdText,
      (chunk) => setReport(prev => prev + chunk),
      async () => {
        setStreaming(false);
        setDone(true);
        // Auto-save
        const finalScore = extractScore(report + '');
        if (finalScore) {
          try {
            await api.createApplication({ company: 'Unknown', role: 'Evaluated role', url: url || null, score: finalScore, status: 'Evaluated', notes: `Auto-saved from Evaluator` });
            qc.invalidateQueries({ queryKey: ['applications'] });
            qc.invalidateQueries({ queryKey: ['stats'] });
          } catch {}
        }
      },
      (err) => { setStreaming(false); toast.error(`Error: ${err.message}`); }
    );
  }, [jdText, url]);

  const handleStop = () => { abortRef.current?.(); setStreaming(false); setDone(true); };
  const handleClear = () => { setJdText(''); setUrl(''); setReport(''); setDone(false); };

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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={btn()} onClick={handleEvaluate} disabled={streaming}>
              {streaming ? '⏳ Evaluando...' : '🔍 Evaluar'}
            </button>
            {streaming && <button style={btn('secondary')} onClick={handleStop}>⏹ Parar</button>}
            <button style={btn('secondary')} onClick={handleClear}>🗑 Limpiar</button>
            {done && url && <button style={btn('secondary')} onClick={handleAddPipeline}>📥 Pipeline</button>}
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

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}
