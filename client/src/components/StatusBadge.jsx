const COLORS = {
  Evaluated: '#3b82f6',
  Applied: '#8b5cf6',
  Responded: '#06b6d4',
  Interview: '#f59e0b',
  Offer: '#22c55e',
  Rejected: '#ef4444',
  Discarded: '#6b7280',
  SKIP: '#6b7280',
};

export default function StatusBadge({ status }) {
  const color = COLORS[status] || '#6b7280';
  return (
    <span style={{
      color, background: `${color}18`, border: `1px solid ${color}40`,
      padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 500,
    }}>
      {status || '—'}
    </span>
  );
}
