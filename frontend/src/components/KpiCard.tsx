import type { ReactNode } from 'react';

export default function KpiCard({
  icon,
  iconBg,
  value,
  unit,
  label,
  delta,
  deltaPositive,
}: {
  icon: ReactNode;
  iconBg: string;
  value: string;
  unit?: string;
  label: string;
  delta?: string;
  deltaPositive?: boolean;
}) {
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </span>
        {delta && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 20,
              background: deltaPositive ? '#eaf5ef' : '#fdeceb',
              color: deltaPositive ? 'var(--c-primary-dark)' : 'var(--c-danger)',
            }}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="font-heading" style={{ fontWeight: 600, fontSize: 24, color: 'var(--c-text)' }}>
        {value}
        {unit && <span style={{ fontSize: 12.5, fontWeight: 400, color: 'var(--c-text-faint)', marginLeft: 4 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 3 }}>{label}</div>
    </div>
  );
}
