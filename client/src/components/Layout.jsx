import { NavLink, Outlet } from 'react-router-dom';
import { useUiStore } from '../store/ui.js';

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
            </NavLink>
          ))}
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
