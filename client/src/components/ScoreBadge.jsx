export default function ScoreBadge({ score, size = 'sm' }) {
  if (score == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const n = parseFloat(score);
  const color = n >= 4 ? '#22c55e' : n >= 3 ? '#f59e0b' : '#ef4444';
  const fontSize = size === 'lg' ? 28 : size === 'md' ? 16 : 13;
  return (
    <span style={{
      color, fontWeight: 700, fontSize,
      background: `${color}18`, padding: size === 'lg' ? '4px 12px' : '2px 8px',
      borderRadius: 999, border: `1px solid ${color}40`,
    }}>
      {n.toFixed(1)}/5
    </span>
  );
}
