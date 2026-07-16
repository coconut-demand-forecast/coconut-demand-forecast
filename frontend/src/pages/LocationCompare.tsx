import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AppLayout from '../components/AppLayout';
import Spinner from '../components/Spinner';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { locationsApi, type LocationCompareItem } from '../api';

const MODEL_NAMES: Record<string, string> = {
  random_forest: 'Random Forest',
  xgboost: 'XGBoost',
  lightgbm: 'LightGBM',
};

export default function LocationCompare() {
  const { t, lang } = useLanguage();
  const { showError } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<LocationCompareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await locationsApi.compare(true);
      setItems([...res.locations].sort((a, b) => b.avg_demand - a.avg_demand));
    } catch (e: any) {
      const msg = e?.response?.data?.detail || (lang === 'th' ? 'โหลดข้อมูลไม่สำเร็จ' : 'Failed to load');
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title={t('navLocationCompare')}>
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-faint)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Spinner size={22} color="var(--c-primary)" />
          {t('locTraining')}
        </div>
      </AppLayout>
    );
  }

  if (error || items.length === 0) {
    return (
      <AppLayout title={t('navLocationCompare')}>
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-faint)' }}>
          {error || t('noData')}
        </div>
      </AppLayout>
    );
  }

  const bestMapeItem = [...items].filter((i) => i.best_mape !== null).sort((a, b) => (a.best_mape ?? 0) - (b.best_mape ?? 0))[0];

  return (
    <AppLayout title={t('navLocationCompare')}>
      <div className="card" style={{ padding: '20px 22px', marginBottom: 15 }}>
        <div className="font-heading" style={{ fontWeight: 600, fontSize: 16, marginBottom: 3 }}>{t('locCompareTitle')}</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 18 }}>{t('locCompareSub')}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--c-text-muted)', borderBottom: '2px solid var(--c-border-light)' }}>
                <th style={{ padding: '11px 14px', fontWeight: 600 }}>{t('locColLocation')}</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>{t('locColRecords')}</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>{t('locColAvgDemand')}</th>
                <th style={{ padding: '11px 14px', fontWeight: 600 }}>{t('locColBestModel')}</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>MAPE</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>R&sup2;</th>
                <th style={{ padding: '11px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.location}
                  style={{
                    borderBottom: '1px solid var(--c-border-light)',
                    background: it.location === bestMapeItem?.location ? '#f7fbf9' : 'transparent',
                  }}
                >
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--c-text-soft)' }}>{it.location}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{it.record_count.toLocaleString()}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{it.avg_demand.toLocaleString()}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--c-text-soft)' }}>{it.best_model ? MODEL_NAMES[it.best_model] ?? it.best_model : '-'}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: it.location === bestMapeItem?.location ? 'var(--c-primary-dark)' : 'var(--c-text-soft)' }}>
                    {it.best_mape !== null ? `${it.best_mape}%` : '-'}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{it.best_r2 !== null ? it.best_r2.toFixed(3) : '-'}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <button
                      onClick={() => navigate(`/forecast?location=${encodeURIComponent(it.location)}`)}
                      style={{ border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-primary-dark)', fontSize: 11.5, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {t('navForecast')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="font-heading" style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{t('locColAvgDemand')}</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 14 }}>{t('locCompareSub')}</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={items}>
            <CartesianGrid stroke="#eef4f0" vertical={false} />
            <XAxis dataKey="location" tick={{ fontSize: 11, fill: '#8fa79b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10.5, fill: '#a9bcb2' }} width={50} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="avg_demand" radius={[6, 6, 3, 3]} fill="#2fa76d" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AppLayout>
  );
}
