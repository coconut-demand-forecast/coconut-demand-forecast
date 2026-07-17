import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import AppLayout from '../components/AppLayout';
import Spinner from '../components/Spinner';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { dataApi, type DataQualitySummary, type DemandRecord, type UploadResult } from '../api';

export default function DataPage() {
  const { t, lang } = useLanguage();
  const { showSuccess, showError } = useToast();
  const [quality, setQuality] = useState<DataQualitySummary | null>(null);
  const [records, setRecords] = useState<DemandRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingReport, setPendingReport] = useState<UploadResult | null>(null);
  const [openHint, setOpenHint] = useState<string | null>(null);
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
    setBusyLabel(t('checkingFile'));
    try {
      const report = await dataApi.upload(file, true);
      if (report.existing_rows_to_replace > 0) {
        setPendingFile(file);
        setPendingReport(report);
      } else {
        const res = await dataApi.upload(file, false);
        showSuccess(
          `${lang === 'th' ? 'นำเข้าข้อมูลสำเร็จ' : 'Import successful'}: ${res.rows_imported}/${res.rows_total} ${t('unitRecords')}`
        );
        await refresh();
      }
    } catch (e: any) {
      showError(e?.response?.data?.detail || (lang === 'th' ? 'อัปโหลดไม่สำเร็จ' : 'Upload failed'));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  };

  const confirmReplace = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setBusyLabel(lang === 'th' ? 'กำลังนำเข้าข้อมูล...' : 'Importing data...');
    try {
      const res = await dataApi.upload(pendingFile, false);
      showSuccess(
        `${lang === 'th' ? 'นำเข้าข้อมูลสำเร็จ' : 'Import successful'}: ${res.rows_imported}/${res.rows_total} ${t('unitRecords')}`
      );
      closeConfirm();
      await refresh();
    } catch (e: any) {
      showError(e?.response?.data?.detail || (lang === 'th' ? 'อัปโหลดไม่สำเร็จ' : 'Upload failed'));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  };

  const handleLoadSample = async () => {
    setBusy(true);
    setBusyLabel(lang === 'th' ? 'กำลังโหลดข้อมูลตัวอย่าง...' : 'Loading sample data...');
    try {
      const res = await dataApi.loadSample();
      showSuccess(`${lang === 'th' ? 'โหลดข้อมูลตัวอย่างสำเร็จ' : 'Sample data loaded'}: ${res.rows_imported} ${t('unitRecords')}`);
      await refresh();
    } catch (e: any) {
      showError(e?.response?.data?.detail || (lang === 'th' ? 'โหลดข้อมูลไม่สำเร็จ' : 'Load failed'));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  };

  const handleClear = async () => {
    setBusy(true);
    setBusyLabel(lang === 'th' ? 'กำลังล้างข้อมูล...' : 'Clearing data...');
    try {
      await dataApi.clear();
      showSuccess(lang === 'th' ? 'ล้างข้อมูลสำเร็จ' : 'Data cleared');
      await refresh();
    } catch (e: any) {
      showError(e?.response?.data?.detail || (lang === 'th' ? 'ล้างข้อมูลไม่สำเร็จ' : 'Clear failed'));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const qualityRows = quality
    ? [
        { key: 'count', label: t('qualityCount'), value: `${quality.count.toLocaleString()} ${t('unitRecords')}`, warn: false, hint: t('qualityHintCount') },
        {
          key: 'dateRange',
          label: t('qualityDateRange'),
          value: quality.date_from && quality.date_to ? `${quality.date_from} - ${quality.date_to}` : '-',
          warn: false,
          hint: t('qualityHintDateRange'),
        },
        { key: 'missing', label: t('qualityMissing'), value: `${quality.missing_value_rows.toLocaleString()}`, warn: quality.missing_value_rows > 0, hint: t('qualityHintMissing') },
        { key: 'duplicate', label: t('qualityDuplicate'), value: `${quality.duplicate_date_rows.toLocaleString()}`, warn: quality.duplicate_date_rows > 0, hint: t('qualityHintDuplicate') },
        { key: 'outlier', label: t('qualityOutlier'), value: `${quality.outlier_rows.toLocaleString()}`, warn: quality.outlier_rows > 0, hint: t('qualityHintOutlier') },
        {
          key: 'usable',
          label: t('qualityUsable'),
          value: `${quality.usable_rows_for_training.toLocaleString()} / ${lang === 'th' ? 'ต้องการอย่างน้อย' : 'need'} ${quality.min_raw_rows_required}`,
          warn: !quality.ready_for_training,
          hint: t('qualityHintUsable'),
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
              <button
                className="btn-primary"
                style={{ fontSize: 13.5, padding: '11px 22px', display: 'flex', alignItems: 'center', gap: 8 }}
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {busy && !pendingFile && <Spinner size={13} color="#fff" />}
                {t('chooseFile')}
              </button>
              <button
                className="btn-primary"
                style={{ fontSize: 13.5, padding: '11px 22px', background: '#fff', color: 'var(--c-primary-dark)', border: '1px solid var(--c-border)', boxShadow: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
                disabled={busy}
                onClick={handleLoadSample}
              >
                {busy && <Spinner size={13} color="var(--c-primary-dark)" />}
                {t('loadSample')}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-warn)', lineHeight: 1.6, marginTop: 10 }}>{t('sampleDataWarning')}</div>
          </div>
          {busy && busyLabel && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--c-text-muted)' }}>
              <Spinner size={13} color="var(--c-primary)" />
              {busyLabel}
            </div>
          )}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--c-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', maxWidth: 320 }}>{t('templateHint')}</div>
            <a
              href={dataApi.templateUrl()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--c-primary-dark)', textDecoration: 'none', border: '1px solid var(--c-border)', padding: '9px 15px', borderRadius: 9, whiteSpace: 'nowrap' }}
            >
              {t('templateBtn')}
            </a>
          </div>
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
              <div key={c.key} style={{ borderRadius: 11, background: c.warn ? '#fdf3e6' : '#f2f8f5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px' }}>
                  <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 7, background: c.warn ? '#f9e3c3' : '#dcefe4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                    {c.warn ? '!' : '✓'}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-text-muted)' }}>
                      {c.label}
                      <button
                        onClick={() => setOpenHint((k) => (k === c.key ? null : c.key))}
                        aria-label="info"
                        style={{
                          width: 14,
                          height: 14,
                          flex: 'none',
                          borderRadius: '50%',
                          border: '1px solid var(--c-border)',
                          background: openHint === c.key ? 'var(--c-primary)' : '#fff',
                          color: openHint === c.key ? '#fff' : 'var(--c-text-faint)',
                          fontSize: 9,
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
                    </span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--c-text-soft)' }}>{c.value}</span>
                  </span>
                </div>
                {openHint === c.key && (
                  <div style={{ padding: '0 13px 12px 46px', fontSize: 11.5, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>{c.hint}</div>
                )}
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

      <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>
          {lang === 'th'
            ? 'ต้องการส่งออกข้อมูลหรือรายงานพยากรณ์? ไปที่หน้า "แดชบอร์ด"'
            : 'Looking to export data or a forecast report? Head to the "Dashboard" page.'}
        </div>
        <button
          onClick={handleClear}
          disabled={busy || !quality?.count}
          style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--c-danger)', cursor: 'pointer', background: '#fff', color: 'var(--c-danger)', fontWeight: 600, fontSize: 13, padding: '9px 16px', borderRadius: 9 }}
        >
          {busy && <Spinner size={13} color="var(--c-danger)" />}
          {t('clearData')}
        </button>
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
              <button className="btn-primary" style={{ fontSize: 13, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }} disabled={busy} onClick={confirmReplace}>
                {busy && <Spinner size={13} color="#fff" />}
                {t('confirmImportBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
