import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import toast from 'react-hot-toast';

const btn = (v = 'primary') => ({
  padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 13,
  background: v === 'primary' ? 'var(--cyan)' : 'var(--bg3)',
  color: '#fff', border: v === 'primary' ? 'none' : '1px solid var(--border)',
});
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 };
const label = { display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 };

export default function Settings() {
  const [tab, setTab] = useState('cv');
  const qc = useQueryClient();

  const { data: cvData } = useQuery({ queryKey: ['cv'], queryFn: api.getCV, enabled: tab === 'cv' });
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: api.getProfile, enabled: tab === 'profile' });

  const [cvContent, setCvContent] = useState('');
  const [apiKey, setApiKey] = useState('');

  const cvMut = useMutation({
    mutationFn: (content) => api.updateCV(content),
    onSuccess: () => { toast.success('CV guardado'); qc.invalidateQueries({ queryKey: ['cv'] }); },
    onError: (err) => toast.error(err.message),
  });

  const testHealth = async () => {
    try {
      const h = await api.health();
      toast.success(`API OK · Qwen key: ${h.env?.hasQwenKey ? '✅ configurada' : '❌ no configurada'}`);
    } catch { toast.error('API no disponible'); }
  };

  const TABS = [
    { id: 'cv', label: '📄 CV' },
    { id: 'profile', label: '👤 Perfil' },
    { id: 'system', label: '🔧 Sistema' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Configuración</h1>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', background: 'transparent',
            color: tab === t.id ? 'var(--cyan-light)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--cyan-light)' : '2px solid transparent',
            fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'cv' && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>CV (cv.md)</div>
          <textarea
            defaultValue={cvData?.content || ''}
            onChange={e => setCvContent(e.target.value)}
            style={{ minHeight: 400, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}
            placeholder="Cargando cv.md..."
          />
          <button style={btn()} onClick={() => cvMut.mutate(cvContent || cvData?.content)}>
            Guardar CV
          </button>
        </div>
      )}

      {tab === 'profile' && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Perfil del candidato</div>
          {profile ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                ['Nombre', profile?.candidate?.full_name],
                ['Email', profile?.candidate?.email],
                ['Teléfono', profile?.candidate?.phone],
                ['Ubicación', profile?.candidate?.location],
                ['LinkedIn', profile?.candidate?.linkedin],
                ['Target salarial', profile?.compensation?.target_range],
                ['Moneda', profile?.compensation?.currency],
                ['Visa', profile?.location?.visa_status],
              ].map(([k, v]) => (
                <div key={k}>
                  <span style={label}>{k}</span>
                  <input defaultValue={v || ''} readOnly style={{ background: 'var(--bg3)' }} />
                </div>
              ))}
            </div>
          ) : <div style={{ color: 'var(--text-muted)' }}>Cargando...</div>}
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 16 }}>
            Para editar el perfil completo, modifica <code>config/profile.yml</code> directamente.
          </p>
        </div>
      )}

      {tab === 'system' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Conexión con el LLM (Qwen)</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Configura la API key de Qwen en el archivo <code>.env</code> del servidor:<br />
              <code>QWEN_API_KEY=sk-xxxx</code>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btn()} onClick={testHealth}>🔌 Test conexión</button>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Archivos del sistema</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              {[
                ['cv.md', 'CV del candidato'],
                ['config/profile.yml', 'Perfil y objetivos'],
                ['portals.yml', 'Portales y queries de scan'],
                ['data/applications.md', 'Tracker de aplicaciones'],
                ['data/pipeline.md', 'Inbox de URLs'],
                ['data/scan-history.tsv', 'Historial de scans'],
              ].map(([file, desc]) => (
                <div key={file} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '10px 14px' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--cyan-light)' }}>{file}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
