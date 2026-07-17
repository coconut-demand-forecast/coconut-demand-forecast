import { useState, type ReactNode } from 'react';

export interface KpiHint {
  sourceLabel: string;
  source: string;
  usageLabel: string;
  usage: string;
}

export default function KpiCard({
  icon,
  iconBg,
  value,
  unit,
  label,
  delta,
  deltaPositive,
  hint,
}: {
  icon: ReactNode;
  iconBg: string;
  value: string;
  unit?: string;
  label: string;
  delta?: string;
  deltaPositive?: boolean;
  hint?: KpiHint;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ padding: '16px 18px', position: 'relative' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
        <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>{label}</span>
        {hint && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="info"
            style={{
              width: 15,
              height: 15,
              flex: 'none',
              borderRadius: '50%',
              border: '1px solid var(--c-border)',
              background: open ? 'var(--c-primary)' : '#fff',
              color: open ? '#fff' : 'var(--c-text-faint)',
              fontSize: 10,
              lineHeight: 1,
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ?
          </button>
        )}
      </div>
      {hint && open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 10,
            right: 10,
            marginTop: 8,
            zIndex: 20,
            background: '#fff',
            border: '1px solid var(--c-border)',
            borderRadius: 10,
            padding: '11px 13px',
            boxShadow: '0 6px 18px rgba(20,102,74,.14)',
            fontSize: 11.5,
            lineHeight: 1.6,
            color: 'var(--c-text-muted)',
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: 'var(--c-text-soft)' }}>{hint.sourceLabel}: </span>
            {hint.source}
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--c-text-soft)' }}>{hint.usageLabel}: </span>
            {hint.usage}
          </div>
        </div>
      )}
    </div>
  );
}
