import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const ORG_OPTIONS: { value: string; labelKey: 'orgFarmer' | 'orgTrader' | 'orgOther' }[] = [
  { value: 'farmer', labelKey: 'orgFarmer' },
  { value: 'trader', labelKey: 'orgTrader' },
  { value: 'other', labelKey: 'orgOther' },
];

export default function AuthPage() {
  const { lang, setLang, t } = useLanguage();
  const { login, register, loading } = useAuth();
  const navigate = useNavigate();

  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [org, setOrg] = useState('farmer');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (isRegister) {
        await register({ name, organization: org, contact, password });
      } else {
        await login(contact, password);
      }
      navigate('/');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  return (
    <div className="auth-shell" style={{ display: 'flex', minHeight: '100vh', width: '100%', background: 'var(--c-bg)' }}>
      <section
        style={{
          flex: 1,
          minWidth: 0,
          background: 'linear-gradient(155deg,#14664a 0%,#1f8a5b 55%,#2fa76d 100%)',
          color: '#eaf5ef',
          padding: '56px 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', right: -90, top: -70, width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
        <div style={{ position: 'absolute', right: 60, bottom: -120, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, position: 'relative' }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5" />
              <path d="M4 15l4-5 4 3 8-9" />
              <path d="M16 4h4v4" />
            </svg>
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 19, color: '#fff' }}>{t('brand')}</div>
            <div style={{ fontSize: 12, color: '#c9e6d8' }}>{t('brandSub')}</div>
          </div>
        </div>

        <div style={{ position: 'relative', maxWidth: 440 }}>
          <h2 className="font-heading" style={{ fontWeight: 600, fontSize: 29, lineHeight: 1.35, margin: '0 0 18px', color: '#fff' }}>
            {t('heroTitle')}
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: '#d6ede2', margin: '0 0 28px' }}>{t('heroSub')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[t('heroPoint1'), t('heroPoint2'), t('heroPoint3')].map((text) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13.5, color: '#eaf5ef' }}>
                <span style={{ width: 26, height: 26, flex: 'none', borderRadius: 8, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', fontSize: 11.5, color: '#bfe0d1' }}>&copy; 2568 {t('brand')} &middot; {t('brandSub')}</div>
      </section>

      <section className="auth-form" style={{ width: 480, flex: 'none', background: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 26 }}>
          <div style={{ display: 'flex', background: 'var(--c-bg)', borderRadius: 10, padding: 3 }}>
            <button
              type="button"
              onClick={() => setLang('th')}
              style={{ border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, background: lang === 'th' ? '#fff' : 'transparent', color: lang === 'th' ? 'var(--c-primary-dark)' : 'var(--c-text-faint)' }}
            >
              ไทย
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              style={{ border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, background: lang === 'en' ? '#fff' : 'transparent', color: lang === 'en' ? 'var(--c-primary-dark)' : 'var(--c-text-faint)' }}
            >
              EN
            </button>
          </div>
        </div>

        <h1 className="font-heading" style={{ fontWeight: 600, fontSize: 26, color: 'var(--c-text)', margin: '0 0 6px' }}>
          {isRegister ? t('registerTitle') : t('loginTitle')}
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--c-text-faint)', margin: '0 0 28px' }}>
          {isRegister ? t('registerSubtitle') : t('loginSubtitle')}
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 7 }}>
                {t('nameLabel')}
              </label>
              <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePh')} required />
            </div>
          )}

          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 7 }}>
                {t('orgLabel')}
              </label>
              <div style={{ display: 'flex', gap: 7 }}>
                {ORG_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setOrg(o.value)}
                    style={{
                      flex: 1,
                      border: `1px solid ${org === o.value ? 'var(--c-primary)' : 'var(--c-border)'}`,
                      background: org === o.value ? '#eaf5ef' : '#fff',
                      color: org === o.value ? 'var(--c-primary-dark)' : 'var(--c-text-muted)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 11.5,
                      padding: '10px 4px',
                      borderRadius: 9,
                      lineHeight: 1.3,
                    }}
                  >
                    {t(o.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 7 }}>
              {t('contactLabel')}
            </label>
            <input className="input-field" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t('contactPh')} required />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-muted)' }}>{t('passLabel')}</label>
              {!isRegister && (
                <a href="#" style={{ fontSize: 11.5, color: 'var(--c-primary)', textDecoration: 'none' }}>
                  {t('forgotPass')}
                </a>
              )}
            </div>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passPh')}
              required
              minLength={6}
            />
          </div>

          {error && <div style={{ color: 'var(--c-danger)', fontSize: 12.5 }}>{error}</div>}

          <button type="submit" className="btn-primary" style={{ marginTop: 6, width: '100%', fontSize: 15, padding: 14 }} disabled={loading}>
            {isRegister ? t('registerCta') : t('loginCta')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 20px' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
          <span style={{ fontSize: 11.5, color: 'var(--c-text-faint)' }}>{t('orDivider')}</span>
          <span style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
        </div>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--c-text-faint)' }}>
          {isRegister ? t('switchToLoginQ') : t('switchToRegisterQ')}{' '}
          <button
            type="button"
            onClick={() => setIsRegister((v) => !v)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--c-primary)', padding: '0 2px' }}
          >
            {isRegister ? t('switchToLoginA') : t('switchToRegisterA')}
          </button>
        </div>
      </section>
    </div>
  );
}
