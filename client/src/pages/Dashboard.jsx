import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../lib/api.js';
import ScoreBadge from '../components/ScoreBadge.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const PIE_COLORS = ['#3b82f6','#8b5cf6','#06b6d4','#f59e0b','#22c55e','#ef4444','#6b7280'];

const card = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '20px 24px',
};

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: api.getStats, refetchInterval: 30000 });
  const { data: apps } = useQuery({ queryKey: ['applications', { limit: 5 }], queryFn: () => api.getApplications({ limit: 5 }) });

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Cargando...</div>;

  const pieData = (stats?.byStatus || []).map(({ status, count }) => ({ name: status, value: count }));

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>Dashboard</h1>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total evaluadas', value: stats?.total ?? 0, color: 'var(--cyan-light)' },
          { label: 'Score promedio', value: stats?.avgScore != null ? `${stats.avgScore}/5` : '—', color: '#f59e0b' },
          { label: 'En proceso', value: stats?.byStatus?.find(s => s.status === 'Interview')?.count ?? 0, color: '#22c55e' },
          { label: 'Rechazadas', value: stats?.byStatus?.find(s => s.status === 'Rejected')?.count ?? 0, color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} style={card}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        {/* Pie chart */}
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Estado de aplicaciones</div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={11}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0' }}>Sin datos aún</div>
          )}
        </div>

        {/* Recent apps */}
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Aplicaciones recientes</div>
          {(apps || []).length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>Sin aplicaciones aún. Evalúa una oferta para empezar.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {(apps || []).map(app => (
                  <tr key={app.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 0', fontWeight: 500 }}>{app.company}</td>
                    <td style={{ padding: '8px 4px', color: 'var(--text-muted)', fontSize: 12 }}>{app.role?.slice(0, 28)}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right' }}><ScoreBadge score={app.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
