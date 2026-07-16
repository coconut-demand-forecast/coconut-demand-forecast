import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, Legend, XAxis, YAxis } from 'recharts';
import AppLayout from '../components/AppLayout';
import LocationSelector from '../components/LocationSelector';
import Spinner from '../components/Spinner';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  dataApi,
  mlApi,
  type DataQualitySummary,
  type ForecastResponse,
  type ModelMetrics,
  type TestPredictionsResponse,
} from '../api';

const MODEL_OPTIONS = [
  { value: 'random_forest', name: 'Random Forest', desc: { th: 'Ensemble ต้นไม้ ทนต่อ outlier', en: 'Robust tree ensemble' } },
  { value: 'xgboost', name: 'XGBoost', desc: { th: 'Gradient boosting แม่นยำสูง', en: 'High-accuracy gradient boosting' } },
  { value: 'lightgbm', name: 'LightGBM', desc: { th: 'เร็ว เหมาะข้อมูลใหญ่', en: 'Fast on large data' } },
];
const MODEL_NAMES: Record<string, string> = {
  random_forest: 'Random Forest',
  xgboost: 'XGBoost',
  lightgbm: 'LightGBM',
};
const MODEL_COLORS: Record<string, string> = {
  random_forest: '#e0983c',
  xgboost: '#1f8a5b',
  lightgbm: '#7c6de0',
};

// Same ranking rule as the backend (app/ml/pipeline.py rank_key) and
// Analytics.tsx: lowest MAPE wins, ties within 0.1 point broken by RMSE,
// then by R² — kept in sync so "best" always agrees across pages.
function rankKey(m: ModelMetrics): [number, number, number] {
  return [Math.round(m.mape * 10) / 10, m.rmse, -m.r2];
}
function compareRank(a: ModelMetrics, b: ModelMetrics): number {
  const ka = rankKey(a);
  const kb = rankKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}

const HORIZON_OPTIONS = [
  { value: 7, key: 'h7' as const },
  { value: 30, key: 'h30' as const },
  { value: 90, key: 'h90' as const },
  { value: 180, key: 'h180' as const },
];

type Stage = 'idle' | 'validate' | 'train' | 'forecast' | 'done';

export default function Forecast() {
  const { t, lang } = useLanguage();
  const { showSuccess, showError } = useToast();
  const [searchParams] = useSearchParams();
  const preselectedModel = searchParams.get('model');
  const preselectedLocation = searchParams.get('location') ?? undefined;

  const [selectedModels, setSelectedModels] = useState<string[]>(
    preselectedModel && MODEL_OPTIONS.some((m) => m.value === preselectedModel)
      ? [preselectedModel]
      : MODEL_OPTIONS.map((m) => m.value)
  );
  const [horizon, setHorizon] = useState(30);
  const [location, setLocation] = useState<string | undefined>(preselectedLocation);
  const [locationReady, setLocationReady] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [metricsByModel, setMetricsByModel] = useState<Record<string, ModelMetrics>>({});
  const [forecastByModel, setForecastByModel] = useState<Record<string, ForecastResponse>>({});
  const [testByModel, setTestByModel] = useState<Record<string, TestPredictionsResponse>>({});
  const [error, setError] = useState<string | null>(null);

  const toggleModel = (value: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev; // always keep at least one selected
        return prev.filter((v) => v !== value);
      }
      return [...prev, value];
    });
  };

  // Auto-run once if we arrived from Analytics with a model preselected —
  // but only after we know the resolved location, so training filters by
  // the right series instead of accidentally combining every location's data.
  useEffect(() => {
    if (preselectedModel && locationReady) {
      runPipeline();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationReady]);

  const runPipeline = async () => {
    setError(null);
    setMetricsByModel({});
    setForecastByModel({});
    setTestByModel({});
    try {
      setStage('validate');
      const quality: DataQualitySummary = await dataApi.quality(location);
      if (!quality.ready_for_training) {
        const msg = quality.reason || (lang === 'th' ? 'ข้อมูลไม่พร้อมสำหรับเทรนโมเดล' : 'Data not ready for training');
        setError(msg);
        showError(msg);
        setStage('idle');
        return;
      }

      setStage('train');
      const trainRes = await mlApi.train(selectedModels, horizon, location);
      const metrics: Record<string, ModelMetrics> = {};
      trainRes.results.forEach((r) => {
        metrics[r.model_type] = r;
      });

      setStage('forecast');
      const pairs = await Promise.all(
        selectedModels.map(async (m) => {
          const [fc, tp] = await Promise.all([mlApi.forecast(m, horizon, location), mlApi.testPredictions(m, location)]);
          return { m, fc, tp };
        })
      );
      const forecasts: Record<string, ForecastResponse> = {};
      const tests: Record<string, TestPredictionsResponse> = {};
      pairs.forEach(({ m, fc, tp }) => {
        forecasts[m] = fc;
        tests[m] = tp;
      });

      setMetricsByModel(metrics);
      setForecastByModel(forecasts);
      setTestByModel(tests);
      setStage('done');

      const best = [...selectedModels].sort((a, b) => compareRank(metrics[a], metrics[b]))[0];
      showSuccess(
        lang === 'th'
          ? `พยากรณ์สำเร็จ (${selectedModels.length} โมเดล) — ดีที่สุด: ${MODEL_NAMES[best]} (MAPE ${metrics[best].mape.toFixed(1)}%)`
          : `Forecast complete (${selectedModels.length} models) — best: ${MODEL_NAMES[best]} (MAPE ${metrics[best].mape.toFixed(1)}%)`
      );
    } catch (e: any) {
      const msg = e?.response?.data?.detail || (lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Something went wrong');
      setError(msg);
      showError(msg);
      setStage('idle');
    }
  };

  const stageMessage = stage === 'validate' ? t('stageValidate') : stage === 'train' ? t('stageTrain') : stage === 'forecast' ? t('stageForecast') : null;
  const busy = stage !== 'idle' && stage !== 'done';

  const ranModels = useMemo(
    () => Object.keys(metricsByModel).sort((a, b) => compareRank(metricsByModel[a], metricsByModel[b])),
    [metricsByModel]
  );
  const bestModel = ranModels[0];
  const anyForecast = ranModels.length > 0;

  const testChartData = useMemo(() => {
    if (!bestModel || !testByModel[bestModel]) return [];
    return testByModel[bestModel].points.map((p, i) => {
      const row: Record<string, string | number> = { date: p.date, actual: p.actual };
      ranModels.forEach((m) => {
        row[m] = testByModel[m]?.points[i]?.predicted;
      });
      return row;
    });
  }, [testByModel, ranModels, bestModel]);

  const futureChartData = useMemo(() => {
    if (!bestModel || !forecastByModel[bestModel]) return [];
    return forecastByModel[bestModel].points.map((p, i) => {
      const row: Record<string, string | number> = { date: p.date };
      ranModels.forEach((m) => {
        row[m] = forecastByModel[m]?.points[i]?.predicted;
      });
      return row;
    });
  }, [forecastByModel, ranModels, bestModel]);

  const trendLabel = (r: ForecastResponse) =>
    r.summary.trend === 'increasing' ? t('trendUp') : r.summary.trend === 'decreasing' ? t('trendDown') : t('trendFlat');

  return (
    <AppLayout
      title={t('navForecast')}
      headerExtra={<LocationSelector value={location} onChange={setLocation} onReady={() => setLocationReady(true)} />}
    >
      <div className="grid-side" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 15, alignItems: 'start' }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 16, marginBottom: 18 }}>{t('configTitle')}</div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12.5, color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: 9 }}>{t('model')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MODEL_OPTIONS.map((m) => {
                const checked = selectedModels.includes(m.value);
                return (
                  <button
                    key={m.value}
                    onClick={() => toggleModel(m.value)}
                    disabled={busy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      border: `1px solid ${checked ? 'var(--c-primary)' : 'var(--c-border)'}`,
                      background: checked ? '#f2f8f5' : '#fff',
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
                        borderRadius: 5,
                        border: `2px solid ${checked ? 'var(--c-primary)' : '#c8d8d0'}`,
                        background: checked ? 'var(--c-primary)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {checked && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--c-text-soft)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: MODEL_COLORS[m.value] }} />
                        {m.name}
                      </span>
                      <span style={{ display: 'block', fontSize: 10.5, color: 'var(--c-text-faint)' }}>{m.desc[lang]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 8 }}>
              {lang === 'th' ? 'เลือกได้มากกว่า 1 โมเดลเพื่อเปรียบเทียบผลพร้อมกัน' : 'Select more than one model to compare results side by side'}
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

          <button
            className="btn-primary"
            style={{ width: '100%', fontSize: 14, padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
            disabled={busy || !locationReady}
            onClick={runPipeline}
          >
            {busy && <Spinner size={14} color="#fff" />}
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
          {anyForecast && (
            <>
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>{t('resultsTitle')}</div>
                  {ranModels.length > 1 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--c-primary-dark)', background: '#eaf5ef', padding: '6px 12px', borderRadius: 20 }}>
                      ✓ {t('bestPick')}: {MODEL_NAMES[bestModel]}
                    </span>
                  )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--c-text-muted)', borderBottom: '2px solid var(--c-border-light)' }}>
                        <th style={{ padding: '11px 14px', fontWeight: 600 }}>{t('modelCol')}</th>
                        <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>MAE</th>
                        <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>RMSE</th>
                        <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>MAPE</th>
                        <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>R&sup2;</th>
                        <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>{t('lblForecastMean')}</th>
                        <th style={{ padding: '11px 14px', fontWeight: 600 }}>{t('lblTrend')}</th>
                        <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranModels.map((m, i) => {
                        const metrics = metricsByModel[m];
                        const fc = forecastByModel[m];
                        return (
                          <tr key={m} style={{ borderBottom: '1px solid var(--c-border-light)', background: i === 0 ? '#f7fbf9' : 'transparent' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--c-text-soft)' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 9, height: 9, borderRadius: '50%', background: MODEL_COLORS[m] }} />
                                {MODEL_NAMES[m]}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{metrics.mae.toFixed(1)}</td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{metrics.rmse.toFixed(1)}</td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{metrics.mape.toFixed(1)}%</td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: i === 0 ? 'var(--c-primary-dark)' : 'var(--c-text-soft)' }}>{metrics.r2.toFixed(3)}</td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{fc ? fc.summary.mean.toLocaleString() : '-'}</td>
                            <td style={{ padding: '12px 14px', color: fc?.summary.trend === 'increasing' ? 'var(--c-primary-dark)' : fc?.summary.trend === 'decreasing' ? 'var(--c-danger)' : 'var(--c-text-muted)' }}>
                              {fc ? `${trendLabel(fc)} (${fc.summary.trend_pct > 0 ? '+' : ''}${fc.summary.trend_pct}%)` : '-'}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              {fc && (
                                <a
                                  href={mlApi.forecastExportUrl(m, fc.horizon_days, location)}
                                  style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-primary)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                                >
                                  {t('exportForecastBtn')}
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', background: '#f4f9f6', borderRadius: 8, padding: '8px 12px', marginTop: 12 }}>{t('unTuned')}</div>
              </div>

              {/* Test-set backtest — clearly separate from the future forecast below */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>{t('testChartTitle')}</div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', marginBottom: 10 }}>{t('testChartSub')}</div>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={testChartData}>
                    <CartesianGrid stroke="#eef4f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#a9bcb2' }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 10.5, fill: '#a9bcb2' }} width={40} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11.5 }} />
                    <Line type="monotone" dataKey="actual" stroke="#14664a" strokeWidth={2} dot={false} name={t('colActual')} />
                    {ranModels.map((m) => (
                      <Line key={m} type="monotone" dataKey={m} stroke={MODEL_COLORS[m]} strokeWidth={1.8} dot={false} name={MODEL_NAMES[m]} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--c-primary)', fontWeight: 600 }}>
                    {t('testTableTitle')} ({MODEL_NAMES[bestModel]})
                  </summary>
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
                        {testByModel[bestModel]?.points.map((p) => (
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
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', marginBottom: 10 }}>{t('futureChartSub')}</div>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={futureChartData}>
                    <CartesianGrid stroke="#eef4f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#a9bcb2' }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10.5, fill: '#a9bcb2' }} width={40} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11.5 }} />
                    {ranModels.map((m) => (
                      <Line key={m} type="monotone" dataKey={m} stroke={MODEL_COLORS[m]} strokeWidth={2.2} dot={false} name={MODEL_NAMES[m]} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>

                <div style={{ overflowX: 'auto', marginTop: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 420 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--c-text-muted)', borderBottom: '2px solid var(--c-border-light)' }}>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>{t('colDate')}</th>
                        {ranModels.map((m) => (
                          <th key={m} style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: MODEL_COLORS[m] }} />
                              {MODEL_NAMES[m]}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {futureChartData.slice(0, 10).map((row) => (
                        <tr key={row.date} style={{ borderBottom: '1px solid var(--c-border-light)' }}>
                          <td style={{ padding: '8px 10px' }}>{row.date}</td>
                          {ranModels.map((m) => (
                            <td key={m} style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--c-text-soft)', fontWeight: 600 }}>
                              {typeof row[m] === 'number' ? (row[m] as number).toLocaleString() : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 14, fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.7, background: '#f4f9f6', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--c-text-soft)' }}>{t('assumptionsTitle')}</div>
                  {forecastByModel[bestModel]?.assumptions}
                </div>
              </div>
            </>
          )}

          {!anyForecast && !busy && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 13 }}>
              {lang === 'th' ? 'กดเทรนโมเดลเพื่อดูผลพยากรณ์' : 'Click "Train Model" to see results'}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
