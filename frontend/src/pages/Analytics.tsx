import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import LocationSelector from '../components/LocationSelector';
import Spinner from '../components/Spinner';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { mlApi, type ModelMetrics } from '../api';

// Same ranking rule as the backend (app/ml/pipeline.py rank_key): lowest
// MAPE wins, ties within 0.1 point broken by RMSE, then by R² — kept in
// sync so this table's order always matches which model /forecast and
// the dashboard treat as "best".
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

export default function Analytics() {
  const { t, lang } = useLanguage();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [results, setResults] = useState<ModelMetrics[]>([]);
  const [bestModel, setBestModel] = useState<string | null>(null);
  const [bestModelReason, setBestModelReason] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<string | undefined>(undefined);
  const [locationReady, setLocationReady] = useState(false);

  const load = async (loc: string | undefined) => {
    setLoading(true);
    setError(null);
    try {
      const res = await mlApi.compare(loc);
      setResults(res.results);
      setBestModel(res.best_model);
      setBestModelReason(res.best_model_reason);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        setResults([]);
        setBestModel(null);
      } else {
        setError(e?.response?.data?.detail || (lang === 'th' ? 'โหลดข้อมูลไม่สำเร็จ' : 'Failed to load'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (locationReady) load(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationReady, location]);

  const trainAll = async () => {
    setTraining(true);
    setError(null);
    try {
      const res = await mlApi.train(['random_forest', 'xgboost', 'lightgbm'], 30, location);
      await load(location);
      showSuccess(
        lang === 'th'
          ? `เทรนสำเร็จ — โมเดลที่ดีที่สุด: ${MODEL_NAMES[res.best_model] ?? res.best_model}`
          : `Training complete — Best model: ${MODEL_NAMES[res.best_model] ?? res.best_model}`
      );
    } catch (e: any) {
      const msg = e?.response?.data?.detail || (lang === 'th' ? 'เทรนโมเดลไม่สำเร็จ' : 'Training failed');
      setError(msg);
      showError(msg);
    } finally {
      setTraining(false);
    }
  };

  const sorted = [...results].sort(compareRank);
  const maxMae = Math.max(...results.map((r) => r.mae), 1);
  const bestResult = sorted[0];
  const features = bestResult ? Object.entries(bestResult.feature_importance).slice(0, 6) : [];

  const headerExtra = (
    <LocationSelector value={location} onChange={setLocation} onReady={() => setLocationReady(true)} />
  );

  if (!locationReady || loading) {
    return (
      <AppLayout title={t('navAnalytics')} headerExtra={headerExtra}>
        <div style={{ padding: 40, color: 'var(--c-text-faint)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner size={16} color="var(--c-primary)" />
          {t('loading')}
        </div>
      </AppLayout>
    );
  }

  if (results.length === 0) {
    return (
      <AppLayout title={t('navAnalytics')} headerExtra={headerExtra}>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--c-text-faint)', marginBottom: 16 }}>
            {lang === 'th' ? 'ยังไม่มีการเทรนโมเดล กดปุ่มด้านล่างเพื่อเทรนและเปรียบเทียบทั้ง 3 โมเดล' : 'No trained models yet. Click below to train and compare all 3 models.'}
          </p>
          <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={trainAll} disabled={training}>
            {training && <Spinner size={13} color="#fff" />}
            {training ? t('training') : t('trainModel')}
          </button>
          {error && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--c-danger)' }}>{error}</div>}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t('navAnalytics')} headerExtra={headerExtra}>
      <div className="card" style={{ padding: '20px 22px', marginBottom: 15 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 16 }}>{t('compareTitle')}</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{t('compareSub')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--c-primary-dark)', background: '#eaf5ef', padding: '6px 12px', borderRadius: 20 }}>
              ✓ {t('bestPick')}: {bestModel ? MODEL_NAMES[bestModel] : '-'}
            </span>
            <button
              className="btn-primary"
              style={{ fontSize: 12.5, padding: '9px 16px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              onClick={trainAll}
              disabled={training}
            >
              {training && <Spinner size={12} color="#fff" />}
              {training ? t('training') : lang === 'th' ? 'เทรนใหม่' : 'Retrain'}
            </button>
          </div>
        </div>
        {bestModelReason && (
          <div style={{ fontSize: 12, color: 'var(--c-text-muted)', background: '#f7fbf9', borderRadius: 8, padding: '9px 13px', marginBottom: 14 }}>
            {bestModelReason}
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--c-text-muted)', borderBottom: '2px solid var(--c-border-light)' }}>
                <th style={{ padding: '11px 14px', fontWeight: 600 }}>{t('modelCol')}</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>MAE</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>RMSE</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>MAPE</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'right' }}>R&sup2;</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'center' }}>{t('rank')}</th>
                <th style={{ padding: '11px 14px', fontWeight: 600, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => (
                <tr key={m.model_type} style={{ borderBottom: '1px solid var(--c-border-light)', background: i === 0 ? '#f7fbf9' : 'transparent' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--c-text-soft)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: MODEL_COLORS[m.model_type] }} />
                      {MODEL_NAMES[m.model_type]}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{m.mae.toFixed(1)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{m.rmse.toFixed(1)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--c-text-muted)' }}>{m.mape.toFixed(1)}%</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: i === 0 ? 'var(--c-primary-dark)' : 'var(--c-text-soft)' }}>{m.r2.toFixed(3)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: i === 0 ? '#eaf5ef' : '#f4f4f4', color: i === 0 ? 'var(--c-primary-dark)' : 'var(--c-text-muted)' }}>
                      #{i + 1}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <button
                      onClick={() =>
                        navigate(`/forecast?model=${m.model_type}${location ? `&location=${encodeURIComponent(location)}` : ''}`)
                      }
                      style={{ border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-primary-dark)', fontSize: 11.5, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {t('useThisModel')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
        <div className="card">
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{t('errTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 18 }}>{t('errSub')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {results.map((m) => (
              <div key={m.model_type}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ color: 'var(--c-text-soft)', fontWeight: 600 }}>{MODEL_NAMES[m.model_type]}</span>
                  <span style={{ color: 'var(--c-text-faint)' }}>MAE {m.mae.toFixed(1)} &middot; RMSE {m.rmse.toFixed(1)}</span>
                </div>
                <div style={{ height: 16, borderRadius: 5, background: 'var(--c-border-light)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 5, width: `${(m.mae / maxMae) * 100}%`, background: MODEL_COLORS[m.model_type], opacity: 0.85 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{t('featTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 18 }}>
            {t('featSub')} ({bestModel ? MODEL_NAMES[bestModel] : '-'})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {features.map(([name, pct]) => (
              <div key={name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                  <span style={{ color: 'var(--c-text-soft)', fontWeight: 500 }}>{name}</span>
                  <span style={{ color: 'var(--c-text-faint)' }}>{pct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 5, background: 'var(--c-border-light)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 5, width: `${pct}%`, background: 'linear-gradient(90deg,#2fa76d,#14664a)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
