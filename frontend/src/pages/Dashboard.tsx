import { useEffect, useState } from 'react';
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
import {
  dashboardApi,
  mlApi,
  type ChannelBreakdown,
  type DashboardSummary,
  type SeasonalPoint,
} from '../api';

const CHANNEL_COLORS = ['#14664a', '#1f8a5b', '#2fa76d', '#7ee0a8'];

export default function Dashboard() {
  const { t, lang } = useLanguage();
  const { showError } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chartData, setChartData] = useState<{ date: string; actual?: number; forecast?: number }[]>([]);
  const [hasForecast, setHasForecast] = useState(false);
  const [channels, setChannels] = useState<ChannelBreakdown[]>([]);
  const [seasonal, setSeasonal] = useState<SeasonalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<string | undefined>(undefined);
  const [locationReady, setLocationReady] = useState(false);

  useEffect(() => {
    if (!locationReady) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [s, series, ch, sp] = await Promise.all([
          dashboardApi.summary(location),
          dashboardApi.demandSeries(90, location),
          dashboardApi.channelBreakdown(location),
          dashboardApi.seasonalPattern(location),
        ]);
        if (cancelled) return;
        setSummary(s);
        setChannels(ch);
        setSeasonal(sp);
        setHasForecast(false);

        const actualPoints = series.map((p) => ({ date: p.date, actual: p.demand }));
        let combined: { date: string; actual?: number; forecast?: number }[] = actualPoints;

        if (s.total_records > 0 && s.best_model) {
          try {
            const fc = await mlApi.forecast(s.best_model, 30, location);
            const forecastPoints = fc.points.map((p) => ({ date: p.date, forecast: p.predicted }));
            combined = [...actualPoints, ...forecastPoints];
            if (!cancelled) setHasForecast(true);
          } catch {
            // forecast optional on dashboard; ignore failures — chart just
            // stays actual-only and keeps the "historical only" title.
          }
        }
        setChartData(combined);
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
  }, [locationReady, location]);

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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
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

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 15 }}>
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
                <span className="font-heading" style={{ fontWeight: 600, fontSize: 16 }}>{summary.best_model}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--c-text-faint)' }}>MAPE {summary.best_mape}%</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <Row label="R²" value={String(summary.best_r2)} />
                <Row label={t('kpiTrainTest')} value={`${summary.train_size ?? '-'} / ${summary.test_size ?? '-'}`} />
                <Row
                  label={t('lblLastTrained')}
                  value={summary.last_trained_at ? new Date(summary.last_trained_at).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US') : '-'}
                />
                <Row label={t('lblLastHorizon')} value={summary.last_forecast_horizon_days ? `${summary.last_forecast_horizon_days} ${lang === 'th' ? 'วัน' : 'days'}` : '-'} />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--c-text-faint)', lineHeight: 1.6, marginTop: 4 }}>
                {lang === 'th'
                  ? 'ไปที่หน้า "พยากรณ์" เพื่อดูรายละเอียดและปรับระยะเวลาพยากรณ์'
                  : 'Go to the Forecasting page to see details and adjust the horizon.'}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>{t('noModelYet')}</p>
          )}
        </div>
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
