import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import AppLayout from '../components/AppLayout';
import { useLanguage } from '../context/LanguageContext';
import { dataApi, type DataQualitySummary, type DemandRecord, type UploadResult } from '../api';

export default function DataPage() {
  const { t, lang } = useLanguage();
  const [quality, setQuality] = useState<DataQualitySummary | null>(null);
  const [records, setRecords] = useState<DemandRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingReport, setPendingReport] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [q, r] = await Promise.all([dataApi.quality(), dataApi.records(8)]);
    setQuality(q);
    setRecords(r);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const closeConfirm = () => {
    setPendingFile(null);
    setPendingReport(null);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const report = await dataApi.upload(file, true);
      if (report.existing_rows_to_replace > 0) {
        setPendingFile(file);
        setPendingReport(report);
      } else {
        const res = await dataApi.upload(file, false);
        setMessage(
          `${lang === 'th' ? 'นำเข้าสำเร็จ' : 'Imported'}: ${res.rows_imported}/${res.rows_total} ${t('unitRecords')}`
        );
        await refresh();
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || (lang === 'th' ? 'อัปโหลดไม่สำเร็จ' : 'Upload failed'));
    } finally {
      setBusy(false);
    }
  };

  const confirmReplace = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setError(null);
    try {
      const res = await dataApi.upload(pendingFile, false);
      setMessage(
        `${lang === 'th' ? 'นำเข้าสำเร็จ' : 'Imported'}: ${res.rows_imported}/${res.rows_total} ${t('unitRecords')}`
      );
      closeConfirm();
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

  const qualityRows = quality
    ? [
        { label: t('qualityCount'), value: `${quality.count.toLocaleString()} ${t('unitRecords')}`, warn: false },
        {
          label: t('qualityDateRange'),
          value: quality.date_from && quality.date_to ? `${quality.date_from} - ${quality.date_to}` : '-',
          warn: false,
        },
        { label: t('qualityMissing'), value: `${quality.missing_value_rows.toLocaleString()}`, warn: quality.missing_value_rows > 0 },
        { label: t('qualityDuplicate'), value: `${quality.duplicate_date_rows.toLocaleString()}`, warn: quality.duplicate_date_rows > 0 },
        { label: t('qualityOutlier'), value: `${quality.outlier_rows.toLocaleString()}`, warn: quality.outlier_rows > 0 },
        {
          label: t('qualityUsable'),
          value: `${quality.usable_rows_for_training.toLocaleString()} / ${lang === 'th' ? 'ต้องการอย่างน้อย' : 'need'} ${quality.min_raw_rows_required}`,
          warn: !quality.ready_for_training,
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
                {busy && !pendingFile ? t('checkingFile') : t('chooseFile')}
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
          {error && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--c-danger)', whiteSpace: 'pre-line' }}>{error}</div>}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>{t('qualityTitle')}</div>
            {quality && quality.count > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: quality.ready_for_training ? '#eaf5ef' : '#fdf3e6',
                  color: quality.ready_for_training ? 'var(--c-primary-dark)' : 'var(--c-warn)',
                }}
              >
                {quality.ready_for_training ? t('qualityReady') : t('qualityNotReady')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {qualityRows.map((c) => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px', borderRadius: 11, background: c.warn ? '#fdf3e6' : '#f2f8f5' }}>
                <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 7, background: c.warn ? '#f9e3c3' : '#dcefe4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                  {c.warn ? '!' : '✓'}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--c-text-muted)' }}>{c.label}</span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--c-text-soft)' }}>{c.value}</span>
                </span>
              </div>
            ))}
            {quality?.reason && (
              <div style={{ fontSize: 11.5, color: 'var(--c-warn)', lineHeight: 1.6 }}>{quality.reason}</div>
            )}
            {!quality?.count && <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>{t('noData')}</div>}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px', marginBottom: 15 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>{t('dataPreview')}</div>
          <span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{quality?.count ?? 0} {t('unitRecords')}</span>
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
            disabled={busy || !quality?.count}
            style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,.4)', cursor: 'pointer', background: 'rgba(255,255,255,.1)', color: '#fff', fontWeight: 600, fontSize: 13.5, padding: '11px 18px', borderRadius: 10 }}
          >
            {t('clearData')}
          </button>
        </div>
      </div>

      {pendingFile && pendingReport && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(23,37,30,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div className="card" style={{ maxWidth: 460, width: '100%', padding: 26 }}>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 17, marginBottom: 10 }}>{t('confirmReplaceTitle')}</div>
            <p style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
              {t('confirmReplaceBody').replace('{n}', pendingReport.existing_rows_to_replace.toLocaleString())}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, marginBottom: 16, background: '#f4f9f6', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--c-text-muted)' }}>{t('rowsTotal')}</span>
                <span style={{ fontWeight: 600 }}>{pendingReport.rows_total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--c-text-muted)' }}>{t('rowsImported')}</span>
                <span style={{ fontWeight: 600, color: 'var(--c-primary-dark)' }}>{pendingReport.rows_imported}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--c-text-muted)' }}>{t('rowsSkippedLabel')}</span>
                <span style={{ fontWeight: 600 }}>{pendingReport.rows_skipped}</span>
              </div>
            </div>
            {pendingReport.warnings.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-warn)', marginBottom: 6 }}>{t('warningsTitle')}</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
                  {pendingReport.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={closeConfirm}
                disabled={busy}
                style={{ border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-muted)', fontWeight: 600, fontSize: 13, padding: '10px 18px', borderRadius: 10, cursor: 'pointer' }}
              >
                {t('cancelBtn')}
              </button>
              <button className="btn-primary" style={{ fontSize: 13, padding: '10px 18px' }} disabled={busy} onClick={confirmReplace}>
                {t('confirmImportBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
