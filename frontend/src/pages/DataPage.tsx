import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import AppLayout from '../components/AppLayout';
import { useLanguage } from '../context/LanguageContext';
import { dataApi, type DemandRecord } from '../api';

export default function DataPage() {
  const { t, lang } = useLanguage();
  const [summary, setSummary] = useState<{ count: number; date_from: string | null; date_to: string | null } | null>(null);
  const [records, setRecords] = useState<DemandRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [s, r] = await Promise.all([dataApi.summary(), dataApi.records(8)]);
    setSummary(s);
    setRecords(r);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await dataApi.upload(file);
      setMessage(`${lang === 'th' ? 'นำเข้าสำเร็จ' : 'Imported'}: ${res.rows_imported} ${t('unitRecords')}`);
      await refresh();
    } catch (e: any) {
      setError(e?.response?.data?.detail || (lang === 'th' ? 'อัปโหลดไม่สำเร็จ' : 'Upload failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleLoadSample = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await dataApi.loadSample();
      setMessage(`${lang === 'th' ? 'โหลดข้อมูลตัวอย่างสำเร็จ' : 'Sample data loaded'}: ${res.rows_imported} ${t('unitRecords')}`);
      await refresh();
    } catch (e: any) {
      setError(e?.response?.data?.detail || (lang === 'th' ? 'โหลดข้อมูลไม่สำเร็จ' : 'Load failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await dataApi.clear();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const checks = summary
    ? [
        {
          ok: summary.count > 0,
          title: lang === 'th' ? 'จำนวนข้อมูล' : 'Record count',
          detail: `${summary.count.toLocaleString()} ${t('unitRecords')}`,
        },
        {
          ok: summary.count >= 70,
          title: lang === 'th' ? 'ปริมาณข้อมูลเพียงพอสำหรับเทรนโมเดล' : 'Enough data to train',
          detail: summary.count >= 70 ? (lang === 'th' ? 'เพียงพอ' : 'Sufficient') : lang === 'th' ? 'ควรมีอย่างน้อย 70 วัน' : 'Need at least ~70 days',
        },
        {
          ok: !!summary.date_from && !!summary.date_to,
          title: lang === 'th' ? 'ช่วงวันที่ข้อมูล' : 'Date range',
          detail: summary.date_from && summary.date_to ? `${summary.date_from} - ${summary.date_to}` : '-',
        },
      ]
    : [];

  return (
    <AppLayout title={t('navData')}>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 15, marginBottom: 15, alignItems: 'start' }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 16, marginBottom: 3 }}>{t('uploadTitle')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)', marginBottom: 16 }}>{t('uploadSub')}</div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            style={{ border: '2px dashed #b9d6c8', borderRadius: 14, background: '#f4f9f6', padding: '30px 20px', textAlign: 'center' }}
          >
            <div style={{ width: 50, height: 50, margin: '0 auto 12px', borderRadius: 14, background: '#e3f1ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#1f8a5b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text-soft)', marginBottom: 4 }}>{t('dropHint')}</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 15 }}>{t('dropSub')}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
              <button className="btn-primary" style={{ fontSize: 13.5, padding: '11px 22px' }} disabled={busy} onClick={() => fileInputRef.current?.click()}>
                {t('chooseFile')}
              </button>
              <button
                className="btn-primary"
                style={{ fontSize: 13.5, padding: '11px 22px', background: '#fff', color: 'var(--c-primary-dark)', border: '1px solid var(--c-border)', boxShadow: 'none' }}
                disabled={busy}
                onClick={handleLoadSample}
              >
                {t('loadSample')}
              </button>
            </div>
          </div>
          {message && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--c-primary-dark)' }}>{message}</div>}
          {error && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--c-danger)' }}>{error}</div>}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>{t('validateTitle')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checks.map((c) => (
              <div key={c.title} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 11, background: c.ok ? '#f2f8f5' : '#fdf3e6' }}>
                <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 7, background: c.ok ? '#dcefe4' : '#f9e3c3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                  {c.ok ? '✓' : '!'}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-soft)' }}>{c.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--c-text-muted)' }}>{c.detail}</span>
                </span>
              </div>
            ))}
            {!summary?.count && <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>{t('noData')}</div>}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px', marginBottom: 15 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>{t('dataPreview')}</div>
          <span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{summary?.count ?? 0} {t('unitRecords')}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 500 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--c-text-muted)', borderBottom: '2px solid var(--c-border-light)' }}>
                <th style={{ padding: '9px 12px', fontWeight: 600 }}>{t('colDate')}</th>
                <th style={{ padding: '9px 12px', fontWeight: 600 }}>{t('colChannel')}</th>
                <th style={{ padding: '9px 12px', fontWeight: 600 }}>{t('colVol')}</th>
                <th style={{ padding: '9px 12px', fontWeight: 600 }}>{t('colPrice')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--c-border-light)', color: 'var(--c-text-soft)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500 }}>{r.date}</td>
                  <td style={{ padding: '9px 12px' }}>{r.channel ?? '-'}</td>
                  <td style={{ padding: '9px 12px' }}>{r.demand.toLocaleString()}</td>
                  <td style={{ padding: '9px 12px' }}>{r.avg_price ?? '-'}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--c-text-faint)' }}>
                    {t('noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: 'linear-gradient(140deg,#1f8a5b,#14664a)', color: '#eaf5ef', borderRadius: 15, padding: '22px 24px' }}>
        <div className="font-heading" style={{ fontWeight: 600, fontSize: 16, color: '#fff', marginBottom: 5 }}>{t('exportTitle')}</div>
        <div style={{ fontSize: 12.5, color: '#c9e6d8', marginBottom: 18, lineHeight: 1.6 }}>{t('exportSub')}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href={dataApi.exportUrl()}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', cursor: 'pointer', background: '#fff', color: 'var(--c-primary-dark)', fontWeight: 600, fontSize: 13.5, padding: '11px 18px', borderRadius: 10, textDecoration: 'none' }}
          >
            {t('exportCsv')}
          </a>
          <button
            onClick={handleClear}
            disabled={busy || !summary?.count}
            style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,.4)', cursor: 'pointer', background: 'rgba(255,255,255,.1)', color: '#fff', fontWeight: 600, fontSize: 13.5, padding: '11px 18px', borderRadius: 10 }}
          >
            {t('clearData')}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
