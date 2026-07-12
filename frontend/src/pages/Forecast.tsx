import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import AppLayout from '../components/AppLayout';
import { useLanguage } from '../context/LanguageContext';
import {
  dataApi,
  mlApi,
  type DataQualitySummary,
  type ForecastResponse,
  type TestPredictionsResponse,
} from '../api';

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

type Stage = 'idle' | 'validate' | 'train' | 'forecast' | 'done';

export default function Forecast() {
  const { t, lang } = useLanguage();
  const [searchParams] = useSearchParams();
  const preselectedModel = searchParams.get('model');

  const [model, setModel] = useState(preselectedModel && MODEL_OPTIONS.some((m) => m.value === preselectedModel) ? preselectedModel : 'xgboost');
  const [horizon, setHorizon] = useState(30);
  const [stage, setStage] = useState<Stage>('idle');
  const [forecastRes, setForecastRes] = useState<ForecastResponse | null>(null);
  const [testRes, setTestRes] = useState<TestPredictionsResponse | null>(null);
  const [futureChartData, setFutureChartData] = useState<any[]>([]);
  const [testChartData, setTestChartData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Auto-run once if we arrived from Analytics with a model preselected.
  useEffect(() => {
    if (preselectedModel) {
      runPipeline();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runPipeline = async () => {
    setError(null);
    setForecastRes(null);
    setTestRes(null);
    try {
      setStage('validate');
      const quality: DataQualitySummary = await dataApi.quality();
      if (!quality.ready_for_training) {
        setError(quality.reason || (lang === 'th' ? 'ข้อมูลไม่พร้อมสำหรับเทรนโมเดล' : 'Data not ready for training'));
        setStage('idle');
        return;
      }

      setStage('train');
      await mlApi.train([model], horizon);

      setStage('forecast');
      const [fc, tp] = await Promise.all([mlApi.forecast(model, horizon), mlApi.testPredictions(model)]);
      setForecastRes(fc);
      setTestRes(tp);
      setFutureChartData(fc.points.map((p) => ({ date: p.date, predicted: p.predicted, lower: p.lower, upper: p.upper })));
      setTestChartData(tp.points.map((p) => ({ date: p.date, actual: p.actual, predicted: p.predicted })));

      setStage('done');
    } catch (e: any) {
      setError(e?.response?.data?.detail || (lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Something went wrong'));
      setStage('idle');
    }
  };

  const stageMessage = stage === 'validate' ? t('stageValidate') : stage === 'train' ? t('stageTrain') : stage === 'forecast' ? t('stageForecast') : null;
  const busy = stage !== 'idle' && stage !== 'done';

  const trendLabel = forecastRes
    ? forecastRes.summary.trend === 'increasing'
      ? t('trendUp')
      : forecastRes.summary.trend === 'decreasing'
      ? t('trendDown')
      : t('trendFlat')
    : '';

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
                  disabled={busy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    border: `1px solid ${model === m.value ? 'var(--c-primary)' : 'var(--c-border)'}`,
                    background: model === m.value ? '#f2f8f5' : '#fff',
                    cursor: busy ? 'default' : 'pointer',
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
                  disabled={busy}
                  style={{
                    border: `1px solid ${horizon === h.value ? 'var(--c-primary)' : 'var(--c-border)'}`,
                    background: horizon === h.value ? '#eaf5ef' : '#fff',
                    color: horizon === h.value ? 'var(--c-primary-dark)' : 'var(--c-text-muted)',
                    cursor: busy ? 'default' : 'pointer',
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

          <button className="btn-primary" style={{ width: '100%', fontSize: 14, padding: 13 }} disabled={busy} onClick={runPipeline}>
            {busy ? stageMessage : t('trainModel')}
          </button>
          {busy && (
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 6, borderRadius: 4, background: 'var(--c-border-light)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'var(--c-primary)',
                    width: stage === 'validate' ? '20%' : stage === 'train' ? '65%' : '90%',
                    transition: 'width .3s',
                  }}
                />
              </div>
            </div>
          )}
          {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--c-danger)', whiteSpace: 'pre-line' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          {forecastRes && (
            <>
              <div className="card">
                <div className="font-heading" style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>{t('resultsTitle')}</div>
                <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>
                  <Stat label={t('lblModelUsed')} value={MODEL_OPTIONS.find((m) => m.value === forecastRes.model_type)?.name ?? forecastRes.model_type} />
                  <Stat label={t('lblTrainSize')} value={forecastRes.train_size.toLocaleString()} />
                  <Stat label={t('lblTestSize')} value={forecastRes.test_size.toLocaleString()} />
                  <Stat label={t('lblHorizonUsed')} value={`${forecastRes.horizon_days} ${lang === 'th' ? 'วัน' : 'days'}`} />
                  <Stat label="MAE" value={forecastRes.mae.toFixed(1)} />
                  <Stat label="RMSE" value={forecastRes.rmse.toFixed(1)} />
                  <Stat label="MAPE" value={`${forecastRes.mape.toFixed(1)}%`} />
                  <Stat label="R²" value={forecastRes.r2.toFixed(3)} color="var(--c-primary-dark)" />
                  <Stat label={t('lblForecastMean')} value={forecastRes.summary.mean.toLocaleString()} />
                  <Stat label={t('lblForecastMax')} value={forecastRes.summary.max.toLocaleString()} />
                  <Stat label={t('lblForecastMin')} value={forecastRes.summary.min.toLocaleString()} />
                  <Stat
                    label={t('lblTrend')}
                    value={`${trendLabel} (${forecastRes.summary.trend_pct > 0 ? '+' : ''}${forecastRes.summary.trend_pct}%)`}
                    color={forecastRes.summary.trend === 'increasing' ? 'var(--c-primary-dark)' : forecastRes.summary.trend === 'decreasing' ? 'var(--c-danger)' : undefined}
                  />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', background: '#f4f9f6', borderRadius: 8, padding: '8px 12px' }}>{t('unTuned')}</div>
              </div>

              {/* Test-set backtest — clearly separate from the future forecast below */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>{t('testChartTitle')}</div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', marginBottom: 10 }}>{t('testChartSub')}</div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={testChartData}>
                    <CartesianGrid stroke="#eef4f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#a9bcb2' }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 10.5, fill: '#a9bcb2' }} width={40} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Line type="monotone" dataKey="actual" stroke="#14664a" strokeWidth={2} dot={false} name={t('colActual')} />
                    <Line type="monotone" dataKey="predicted" stroke="#e0983c" strokeWidth={2} dot={false} name={t('colPredicted')} />
                  </ComposedChart>
                </ResponsiveContainer>
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--c-primary)', fontWeight: 600 }}>{t('testTableTitle')}</summary>
                  <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--c-text-muted)', borderBottom: '2px solid var(--c-border-light)' }}>
                          <th style={{ padding: '6px 10px' }}>{t('colDate')}</th>
                          <th style={{ padding: '6px 10px' }}>{t('colActual')}</th>
                          <th style={{ padding: '6px 10px' }}>{t('colPredicted')}</th>
                          <th style={{ padding: '6px 10px' }}>{t('colError')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {testRes?.points.map((p) => (
                          <tr key={p.date} style={{ borderBottom: '1px solid var(--c-border-light)' }}>
                            <td style={{ padding: '6px 10px' }}>{p.date}</td>
                            <td style={{ padding: '6px 10px' }}>{p.actual.toLocaleString()}</td>
                            <td style={{ padding: '6px 10px' }}>{p.predicted.toLocaleString()}</td>
                            <td style={{ padding: '6px 10px', color: p.error >= 0 ? 'var(--c-danger)' : 'var(--c-primary-dark)' }}>{p.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>

              {/* Future forecast — no actual values exist for this period */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>{t('futureChartTitle')}</div>
                  <a
                    href={mlApi.forecastExportUrl(forecastRes.model_type, forecastRes.horizon_days)}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-primary)', textDecoration: 'none' }}
                  >
                    {t('exportForecastBtn')}
                  </a>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', marginBottom: 10 }}>{t('futureChartSub')}</div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={futureChartData}>
                    <CartesianGrid stroke="#eef4f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#a9bcb2' }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10.5, fill: '#a9bcb2' }} width={40} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="upper" stroke="none" fill="#2fa76d" fillOpacity={0.12} />
                    <Area type="monotone" dataKey="lower" stroke="none" fill="#fff" fillOpacity={1} />
                    <Line type="monotone" dataKey="predicted" stroke="#2fa76d" strokeWidth={2.4} dot={false} name={t('colPredicted')} />
                  </ComposedChart>
                </ResponsiveContainer>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--c-text-muted)', borderBottom: '2px solid var(--c-border-light)' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>{t('colDate')}</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>{t('colDemandF')}</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>{t('colLower')}</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>{t('colUpper')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastRes.points.slice(0, 10).map((p) => (
                      <tr key={p.date} style={{ borderBottom: '1px solid var(--c-border-light)' }}>
                        <td style={{ padding: '8px 10px' }}>{p.date}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--c-primary)', fontWeight: 600 }}>{p.predicted.toLocaleString()}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--c-text-faint)' }}>{p.lower.toLocaleString()}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--c-text-faint)' }}>{p.upper.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: 14, fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.7, background: '#f4f9f6', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--c-text-soft)' }}>{t('assumptionsTitle')}</div>
                  {forecastRes.assumptions}
                </div>
              </div>
            </>
          )}

          {!forecastRes && !busy && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 13 }}>
              {lang === 'th' ? 'กดเทรนโมเดลเพื่อดูผลพยากรณ์' : 'Click "Train Model" to see results'}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#f7fbf9', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--c-text-faint)', marginBottom: 3 }}>{label}</div>
      <div className="font-heading" style={{ fontSize: 15, fontWeight: 600, color: color ?? 'var(--c-text-soft)' }}>{value}</div>
    </div>
  );
}
