import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from 'recharts';
import AppLayout from '../components/AppLayout';
import KpiCard from '../components/KpiCard';
import LocationSelector from '../components/LocationSelector';
import Spinner from '../components/Spinner';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import type { Lang } from '../i18n';
import {
  dashboardApi,
  dataApi,
  mlApi,
  type ChannelBreakdown,
  type DashboardSummary,
  type SeasonalPoint,
} from '../api';

const CHANNEL_COLORS = ['#14664a', '#1f8a5b', '#2fa76d', '#7ee0a8'];
const MODEL_NAMES: Record<string, string> = {
  random_forest: 'Random Forest',
  xgboost: 'XGBoost',
  lightgbm: 'LightGBM',
};
const CHART_HORIZON_OPTIONS = [
  { value: 30, key: 'h30' as const },
  { value: 60, key: 'h60' as const },
  { value: 90, key: 'h90' as const },
  { value: 120, key: 'h120' as const },
];
const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// Forecasts always start the day after the last date in the uploaded data
// (not "today") — so the month picker must be anchored there too, or a
// selected month could fall entirely outside what the model ever predicts.
function buildMonthOptions(lang: Lang, anchor: Date) {
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label =
      lang === 'th' ? `${THAI_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}` : d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
}

export default function Dashboard() {
  const { t, lang } = useLanguage();
  const { showError } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [actualPoints, setActualPoints] = useState<{ date: string; actual: number }[]>([]);
  const [chartData, setChartData] = useState<{ date: string; actual?: number; forecast?: number }[]>([]);
  const [hasForecast, setHasForecast] = useState(false);
  const [chartHorizon, setChartHorizon] = useState(30);
  const [channels, setChannels] = useState<ChannelBreakdown[]>([]);
  const [seasonal, setSeasonal] = useState<SeasonalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<string | undefined>(undefined);
  const [locationReady, setLocationReady] = useState(false);
  const [forecastAnchor, setForecastAnchor] = useState<Date | null>(null);

  const monthOptions = useMemo(() => buildMonthOptions(lang, forecastAnchor ?? new Date()), [lang, forecastAnchor]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [monthResult, setMonthResult] = useState<{ total: number; avgDay: number; days: number } | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState<string | null>(null);

  useEffect(() => {
    if (monthOptions.length > 0) setSelectedMonth((prev) => (prev && monthOptions.some((m) => m.value === prev) ? prev : monthOptions[0].value));
  }, [monthOptions]);

  // Base data: KPIs, historical series, channel/seasonal breakdowns —
  // independent of the chart's forecast horizon.
  useEffect(() => {
    if (!locationReady) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setMonthResult(null);
      try {
        const [s, series, ch, sp, quality] = await Promise.all([
          dashboardApi.summary(location),
          dashboardApi.demandSeries(90, location),
          dashboardApi.channelBreakdown(location),
          dashboardApi.seasonalPattern(location),
          dataApi.quality(location),
        ]);
        if (cancelled) return;
        setSummary(s);
        setChannels(ch);
        setSeasonal(sp);
        setActualPoints(series.map((p) => ({ date: p.date, actual: p.demand })));
        // Forecasts start the day after the last date in the data, not
        // "today" — anchor the month picker there so every option is
        // actually reachable by the model.
        if (quality.date_to) {
          const firstForecastDay = new Date(quality.date_to);
          firstForecastDay.setDate(firstForecastDay.getDate() + 1);
          setForecastAnchor(firstForecastDay);
        } else {
          setForecastAnchor(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.response?.data?.detail || 'โหลดข้อมูลไม่สำเร็จ';
          setError(msg);
          showError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationReady, location]);

  // Forecast overlay — refetched whenever the user picks a different chart
  // horizon, kept separate so it doesn't re-trigger the base KPI load above.
  useEffect(() => {
    if (!summary || summary.total_records === 0 || !summary.best_model) {
      setChartData(actualPoints);
      setHasForecast(false);
      return;
    }
    let cancelled = false;
    async function loadForecast() {
      try {
        const fc = await mlApi.forecast(summary!.best_model!, chartHorizon, location);
        if (cancelled) return;
        const forecastPoints = fc.points.map((p) => ({ date: p.date, forecast: p.predicted }));
        setChartData([...actualPoints, ...forecastPoints]);
        setHasForecast(true);
      } catch {
        if (!cancelled) {
          setChartData(actualPoints);
          setHasForecast(false);
        }
      }
    }
    loadForecast();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, chartHorizon, location, actualPoints]);

  const viewMonthlyForecast = async () => {
    if (!summary?.best_model || !selectedMonth) return;
    setMonthLoading(true);
    setMonthError(null);
    setMonthResult(null);
    try {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const lastDayOfMonth = new Date(year, month, 0);
      const anchor = forecastAnchor ?? new Date();
      const horizonNeeded = Math.min(365, Math.max(1, Math.ceil((lastDayOfMonth.getTime() - anchor.getTime()) / 86400000) + 1));
      const fc = await mlApi.forecast(summary.best_model, horizonNeeded, location);
      const monthPoints = fc.points.filter((p) => p.date.startsWith(selectedMonth));
      if (monthPoints.length === 0) {
        setMonthError(lang === 'th' ? 'ไม่มีข้อมูลพยากรณ์สำหรับเดือนนี้' : 'No forecast data available for this month');
      } else {
        const total = monthPoints.reduce((sum, p) => sum + p.predicted, 0);
        setMonthResult({ total, avgDay: total / monthPoints.length, days: monthPoints.length });
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || (lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Something went wrong');
      setMonthError(msg);
      showError(msg);
    } finally {
      setMonthLoading(false);
    }
  };

  const headerExtra = (
    <LocationSelector value={location} onChange={setLocation} onReady={() => setLocationReady(true)} />
  );

  if (!locationReady || loading) {
    return (
      <AppLayout title={t('navDashboard')} headerExtra={headerExtra}>
        <div style={{ padding: 40, color: 'var(--c-text-faint)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner size={16} color="var(--c-primary)" />
          {t('loading')}
        </div>
      </AppLayout>
    );
  }

  if (error || !summary || summary.total_records === 0) {
    return (
      <AppLayout title={t('navDashboard')} headerExtra={headerExtra}>
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-faint)' }}>
          {error || t('noData')}
        </div>
      </AppLayout>
    );
  }

  const maxChannel = Math.max(...channels.map((c) => c.total_demand), 1);
  const accuracyPct = summary.best_mape !== null ? Math.max(0, Math.min(100, 100 - summary.best_mape)) : null;

  return (
    <AppLayout title={t('navDashboard')} headerExtra={headerExtra}>
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 15, marginBottom: 16 }}>
        <KpiCard
          icon={<span style={{ fontSize: 16 }}>📦</span>}
          iconBg="#eaf5ef"
          value={summary.total_records.toLocaleString()}
          unit={t('unitRecords')}
          label={t('kpiTotalRecords')}
        />
        <KpiCard
          icon={<span style={{ fontSize: 16 }}>📈</span>}
          iconBg="#eaf5ef"
          value={summary.avg_demand_30d?.toLocaleString() ?? '-'}
          unit={t('unitUnits')}
          label={t('kpiAvgDemand')}
        />
        <KpiCard
          icon={<span style={{ fontSize: 16 }}>💰</span>}
          iconBg="#fdf3e6"
          value={summary.avg_price_30d?.toLocaleString() ?? '-'}
          unit={t('unitBaht')}
          label={t('kpiAvgPrice')}
        />
        <KpiCard
          icon={<span style={{ fontSize: 16 }}>{(summary.growth_pct ?? 0) >= 0 ? '⬆️' : '⬇️'}</span>}
          iconBg={(summary.growth_pct ?? 0) >= 0 ? '#eaf5ef' : '#fdeceb'}
          value={summary.growth_pct !== null ? `${summary.growth_pct > 0 ? '+' : ''}${summary.growth_pct}` : '-'}
          unit="%"
          label={t('kpiGrowth')}
        />
      </div>

      <div className="grid-side" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 15, marginBottom: 15 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>
                {hasForecast ? t('chartTitleActualAndForecast') : t('chartTitleActualOnly')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{t('demandSub')}</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--c-text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--c-primary-dark)' }} />
                {t('actual')}
              </span>
              {hasForecast && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--c-primary-light)' }} />
                  {t('forecast')}
                </span>
              )}
            </div>
          </div>
          {summary.best_model && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {CHART_HORIZON_OPTIONS.map((h) => (
                <button
                  key={h.value}
                  onClick={() => setChartHorizon(h.value)}
                  style={{
                    border: `1px solid ${chartHorizon === h.value ? 'var(--c-primary)' : 'var(--c-border)'}`,
                    background: chartHorizon === h.value ? '#eaf5ef' : '#fff',
                    color: chartHorizon === h.value ? 'var(--c-primary-dark)' : 'var(--c-text-muted)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 11.5,
                    padding: '6px 12px',
                    borderRadius: 8,
                  }}
                >
                  {t(h.key)}
                </button>
              ))}
            </div>
          )}
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="#eef4f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9.5, fill: '#a9bcb2' }} minTickGap={30} />
              <YAxis tick={{ fontSize: 10.5, fill: '#a9bcb2' }} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="actual" stroke="#14664a" strokeWidth={2.4} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="forecast" stroke="#2fa76d" strokeWidth={2.4} strokeDasharray="6 5" dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{t('regionTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 16 }}>{t('regionSub')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {channels.map((c, i) => (
              <div key={c.channel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                  <span style={{ color: 'var(--c-text-soft)', fontWeight: 500 }}>{c.channel}</span>
                  <span style={{ color: 'var(--c-text-faint)' }}>{c.pct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 5, background: 'var(--c-border-light)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 5,
                      width: `${(c.total_demand / maxChannel) * 100}%`,
                      background: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 15, marginBottom: 15 }}>
        <div className="card">
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{t('seasonTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 14 }}>{t('seasonSub')}</div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={seasonal}>
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#8fa79b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="avg_demand" radius={[5, 5, 3, 3]} fill="#2fa76d" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 15 }}>
              {lang === 'th' ? 'สรุปโมเดล' : 'Model Summary'}
            </div>
          </div>
          {summary.best_model ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--c-primary)' }} />
                <span className="font-heading" style={{ fontWeight: 600, fontSize: 16 }}>
                  {MODEL_NAMES[summary.best_model] ?? summary.best_model}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', marginBottom: 2 }}>{t('accuracyLabel')}</div>
                <div className="font-heading" style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-primary-dark)' }}>
                  {accuracyPct !== null ? `${accuracyPct.toFixed(1)}%` : '-'}
                </div>
              </div>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--c-primary)', fontWeight: 600 }}>{t('techDetails')}</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, marginTop: 8 }}>
                  <Row label="MAPE" value={summary.best_mape !== null ? `${summary.best_mape}%` : '-'} />
                  <Row label="R²" value={String(summary.best_r2 ?? '-')} />
                  <Row label={t('kpiTrainTest')} value={`${summary.train_size ?? '-'} / ${summary.test_size ?? '-'}`} />
                  <Row
                    label={t('lblLastTrained')}
                    value={summary.last_trained_at ? new Date(summary.last_trained_at).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US') : '-'}
                  />
                  <Row label={t('lblLastHorizon')} value={summary.last_forecast_horizon_days ? `${summary.last_forecast_horizon_days} ${lang === 'th' ? 'วัน' : 'days'}` : '-'} />
                </div>
              </details>
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>{t('noModelYet')}</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="font-heading" style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{t('monthlyTitle')}</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 16 }}>{t('monthlySub')}</div>
        {!summary.best_model ? (
          <p style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>{t('monthlyNoModel')}</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: monthResult || monthError ? 18 : 0 }}>
              <span style={{ fontSize: 12.5, color: 'var(--c-text-muted)', fontWeight: 600 }}>{t('monthlySelectLabel')}</span>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setMonthResult(null);
                  setMonthError(null);
                }}
                style={{
                  border: '1px solid var(--c-border)',
                  borderRadius: 9,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  color: 'var(--c-text-soft)',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                className="btn-primary"
                style={{ fontSize: 12.5, padding: '9px 16px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                onClick={viewMonthlyForecast}
                disabled={monthLoading}
              >
                {monthLoading && <Spinner size={12} color="#fff" />}
                {t('monthlyBtn')}
              </button>
            </div>
            {monthError && <div style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{monthError}</div>}
            {monthResult && (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', marginBottom: 2 }}>{t('monthlyTotal')}</div>
                  <div className="font-heading" style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-primary-dark)' }}>
                    {Math.round(monthResult.total).toLocaleString()} {t('unitUnits')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--c-text-faint)', marginBottom: 2 }}>{t('monthlyAvgDay')}</div>
                  <div className="font-heading" style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text-soft)' }}>
                    {Math.round(monthResult.avgDay).toLocaleString()} {t('unitUnits')}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--c-text-faint)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--c-text-soft)' }}>{value}</span>
    </div>
  );
}
