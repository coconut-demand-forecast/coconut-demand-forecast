import { useEffect, useState } from 'react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import AppLayout from '../components/AppLayout';
import { useLanguage } from '../context/LanguageContext';
import { dashboardApi, mlApi, type ForecastPoint, type ModelMetrics } from '../api';

const MODEL_OPTIONS = [
  { value: 'random_forest', name: 'Random Forest', desc: { th: 'Ensemble ต้นไม้ ทนต่อ outlier', en: 'Robust tree ensemble' } },
  { value: 'xgboost', name: 'XGBoost', desc: { th: 'Gradient boosting แม่นยำสูง', en: 'High-accuracy gradient boosting' } },
  { value: 'lightgbm', name: 'LightGBM', desc: { th: 'เร็ว เหมาะข้อมูลใหญ่', en: 'Fast on large data' } },
];

const HORIZON_OPTIONS = [
  { value: 7, key: 'h7' as const },
  { value: 30, key: 'h30' as const },
  { value: 90, key: 'h90' as const },
  { value: 180, key: 'h180' as const },
];

export default function Forecast() {
  const { t, lang } = useLanguage();
  const [model, setModel] = useState('xgboost');
  const [horizon, setHorizon] = useState(30);
  const [training, setTraining] = useState(false);
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [forecastPoints, setForecastPoints] = useState<ForecastPoint[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dashboardApi
      .demandSeries(60)
      .then((series) => setChartData(series.map((p) => ({ date: p.date, actual: p.demand }))))
      .catch(() => {});
  }, []);

  const runTrainAndForecast = async () => {
    setTraining(true);
    setError(null);
    try {
      const trainRes = await mlApi.train([model], horizon);
      const m = trainRes.results.find((r) => r.model_type === model) ?? trainRes.results[0];
      setMetrics(m);

      const fc = await mlApi.forecast(model, horizon);
      setForecastPoints(fc.points);

      const actualTail = await dashboardApi.demandSeries(60);
      const combined = [
        ...actualTail.map((p) => ({ date: p.date, actual: p.demand })),
        ...fc.points.map((p) => ({ date: p.date, predicted: p.predicted, lower: p.lower, upper: p.upper })),
      ];
      setChartData(combined);
    } catch (e: any) {
      setError(e?.response?.data?.detail || (lang === 'th' ? 'เทรนโมเดลไม่สำเร็จ' : 'Training failed'));
    } finally {
      setTraining(false);
    }
  };

  const stats = metrics
    ? [
        { label: 'MAE', value: metrics.mae.toFixed(1), color: 'var(--c-text)' },
        { label: 'RMSE', value: metrics.rmse.toFixed(1), color: 'var(--c-text)' },
        { label: 'R²', value: metrics.r2.toFixed(3), color: 'var(--c-primary-dark)' },
      ]
    : [];

  return (
    <AppLayout title={t('navForecast')}>
      <div className="grid-side" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 15, alignItems: 'start' }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 16, marginBottom: 18 }}>{t('configTitle')}</div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12.5, color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: 9 }}>{t('model')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MODEL_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setModel(m.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    border: `1px solid ${model === m.value ? 'var(--c-primary)' : 'var(--c-border)'}`,
                    background: model === m.value ? '#f2f8f5' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: '11px 13px',
                    borderRadius: 11,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      flex: 'none',
                      borderRadius: '50%',
                      border: `2px solid ${model === m.value ? 'var(--c-primary)' : '#c8d8d0'}`,
                      background: model === m.value ? 'var(--c-primary)' : 'transparent',
                    }}
                  />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--c-text-soft)' }}>{m.name}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--c-text-faint)' }}>{m.desc[lang]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 12.5, color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: 9 }}>{t('horizon')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {HORIZON_OPTIONS.map((h) => (
                <button
                  key={h.value}
                  onClick={() => setHorizon(h.value)}
                  style={{
                    border: `1px solid ${horizon === h.value ? 'var(--c-primary)' : 'var(--c-border)'}`,
                    background: horizon === h.value ? '#eaf5ef' : '#fff',
                    color: horizon === h.value ? 'var(--c-primary-dark)' : 'var(--c-text-muted)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 13,
                    padding: '11px 0',
                    borderRadius: 10,
                  }}
                >
                  {t(h.key)}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary" style={{ width: '100%', fontSize: 14, padding: 13 }} disabled={training} onClick={runTrainAndForecast}>
            {training ? t('training') : t('trainModel')}
          </button>
          {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--c-danger)' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          {stats.length > 0 && (
            <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              {stats.map((s) => (
                <div key={s.label} className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 8 }}>{s.label}</div>
                  <div className="font-heading" style={{ fontWeight: 600, fontSize: 21, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>{t('resultChart')}</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--c-text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--c-primary-dark)' }} />
                  {t('actual')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--c-primary-light)' }} />
                  {t('forecast')}
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData}>
                <CartesianGrid stroke="#eef4f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9.5, fill: '#a9bcb2' }} minTickGap={30} />
                <YAxis tick={{ fontSize: 10.5, fill: '#a9bcb2' }} width={40} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="upper" stroke="none" fill="#2fa76d" fillOpacity={0.12} />
                <Area type="monotone" dataKey="lower" stroke="none" fill="#fff" fillOpacity={1} />
                <Line type="monotone" dataKey="actual" stroke="#14664a" strokeWidth={2.4} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="predicted" stroke="#2fa76d" strokeWidth={2.4} strokeDasharray="6 5" dot={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>{t('fcTableTitle')}</div>
            <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 420 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--c-text-muted)', borderBottom: '2px solid var(--c-border-light)' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>{t('colDate')}</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>{t('colDemandF')}</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>{t('colLower')}</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>{t('colUpper')}</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastPoints.map((p) => (
                    <tr key={p.date} style={{ borderBottom: '1px solid var(--c-border-light)', color: 'var(--c-text-soft)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{p.date}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--c-primary)', fontWeight: 600 }}>{p.predicted.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--c-text-faint)' }}>{p.lower.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--c-text-faint)' }}>{p.upper.toLocaleString()}</td>
                    </tr>
                  ))}
                  {forecastPoints.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--c-text-faint)' }}>
                        {lang === 'th' ? 'กดเทรนโมเดลเพื่อดูผลพยากรณ์' : 'Click "Train Model" to see results'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
