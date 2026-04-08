import { NavLink, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useUiStore } from '../store/ui.js';
import { subscribe, getState } from '../lib/evaluationStore.js';

const NAV = [
  { to: '/', label: '📊 Dashboard', end: true },
  { to: '/evaluate', label: '🔍 Evaluar Oferta' },
  { to: '/applications', label: '📋 Aplicaciones' },
  { to: '/pipeline', label: '📥 Pipeline' },
  { to: '/scanner', label: '🔭 Scanner' },
  { to: '/settings', label: '⚙️ Configuración' },
];

const styles = {
  sidebar: {
    width: 'var(--sidebar-w)', minWidth: 'var(--sidebar-w)',
    background: 'var(--bg2)', borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
  },
  logo: {
    padding: '20px 16px 12px', borderBottom: '1px solid var(--border)',
    fontWeight: 700, fontSize: 15, color: 'var(--cyan-light)', letterSpacing: '-0.3px',
  },
  nav: { flex: 1, padding: '12px 8px', overflowY: 'auto' },
  link: {
    display: 'block', padding: '8px 12px', borderRadius: 6,
    color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 2,
    fontSize: 13, transition: 'all 0.15s',
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  content: { flex: 1, overflowY: 'auto', padding: '24px 28px' },
};

export default function Layout() {
  const [evalRunning, setEvalRunning] = useState(() => getState().status === 'streaming');

  useEffect(() => {
    const unsub = subscribe(s => setEvalRunning(s.status === 'streaming'));
    return unsub;
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>career-ops ✦</div>
        <nav style={styles.nav}>
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to} to={to} end={end}
              style={({ isActive }) => ({
                ...styles.link,
                background: isActive ? 'var(--bg3)' : 'transparent',
                color: isActive ? 'var(--cyan-light)' : 'var(--text-muted)',
              })}
            >
              {label}
              {/* Show pulsing dot on Evaluar when stream is running */}
              {to === '/evaluate' && evalRunning && (
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: '#22c55e', marginLeft: 7, verticalAlign: 'middle',
                  animation: 'pulse 1.2s infinite',
                }} />
              )}
            </NavLink>
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
          Jon Peciña · Finance
        </div>
      </aside>
      <main style={styles.main}>
        <div style={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
