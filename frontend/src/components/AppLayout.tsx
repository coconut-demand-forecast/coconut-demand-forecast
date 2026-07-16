import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  data: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  ),
  forecast: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5" />
      <path d="M4 15l4-5 4 3 8-9" />
      <path d="M16 4h4v4" />
    </svg>
  ),
  analytics: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
    </svg>
  ),
  locationCompare: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  ),
};

export default function AppLayout({
  title,
  headerExtra,
  children,
}: {
  title: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();

  const navItems = [
    { to: '/', key: 'dashboard', label: t('navDashboard') },
    { to: '/data', key: 'data', label: t('navData') },
    { to: '/forecast', key: 'forecast', label: t('navForecast') },
    { to: '/analytics', key: 'analytics', label: t('navAnalytics') },
    { to: '/locations', key: 'locationCompare', label: t('navLocationCompare') },
  ];

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="shell" style={{ display: 'flex', minHeight: '100vh', width: '100%', background: 'var(--c-bg)' }}>
      <aside
        className="aside"
        style={{
          width: 242,
          flex: 'none',
          background: '#fff',
          borderRight: '1px solid var(--c-border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 14px',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 20px' }}>
          <div style={{ width: 40, height: 40, flex: 'none', borderRadius: 12, background: 'linear-gradient(140deg,#2fa76d,#14664a)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 9px rgba(31,138,91,.28)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5" />
              <path d="M4 15l4-5 4 3 8-9" />
              <path d="M16 4h4v4" />
            </svg>
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 14.5, color: '#14251d' }}>{t('brand')}</div>
            <div style={{ fontSize: 10, color: 'var(--c-text-faint)', letterSpacing: '.02em' }}>{t('brandSub')}</div>
          </div>
        </div>

        <nav className="navlist" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                fontSize: 13.5,
                textAlign: 'left',
                textDecoration: 'none',
                background: isActive ? '#eaf5ef' : 'transparent',
                color: isActive ? 'var(--c-primary-dark)' : 'var(--c-text-muted)',
                fontWeight: isActive ? 600 : 500,
              })}
            >
              <span style={{ flex: 'none', display: 'flex' }}>{NAV_ICONS[n.key]}</span>
              <span className="navlabel">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="side-extra" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', background: 'var(--c-bg)', borderRadius: 10, padding: 3 }}>
            <button
              onClick={() => setLang('th')}
              style={{ flex: 1, border: 'none', cursor: 'pointer', padding: 7, borderRadius: 7, fontSize: 12, fontWeight: 600, background: lang === 'th' ? '#fff' : 'transparent', color: lang === 'th' ? 'var(--c-primary-dark)' : 'var(--c-text-faint)' }}
            >
              ไทย
            </button>
            <button
              onClick={() => setLang('en')}
              style={{ flex: 1, border: 'none', cursor: 'pointer', padding: 7, borderRadius: 7, fontSize: 12, fontWeight: 600, background: lang === 'en' ? '#fff' : 'transparent', color: lang === 'en' ? 'var(--c-primary-dark)' : 'var(--c-text-faint)' }}
            >
              EN
            </button>
          </div>
          <button
            onClick={doLogout}
            style={{ display: 'flex', alignItems: 'center', gap: 9, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--c-text-faint)', fontSize: 12.5, padding: '6px 8px', borderRadius: 8 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
              <path d="M10 17l-5-5 5-5" />
              <path d="M5 12h11" />
            </svg>
            {t('logout')}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 30px 14px', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 2 }}>{t('crumb')}</div>
            <h1 className="font-heading" style={{ margin: 0, fontWeight: 600, fontSize: 22, color: 'var(--c-text)' }}>{title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {headerExtra}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--c-border)', borderRadius: 10, padding: '8px 13px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--c-primary-light)', boxShadow: '0 0 0 3px rgba(47,167,109,.16)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--c-text-muted)', fontWeight: 500 }}>{t('synthetic')}</span>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(140deg,#2fa76d,#14664a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#fff', fontSize: 14 }}>
              {initials}
            </div>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 30px 40px' }}>{children}</div>
      </main>
    </div>
  );
}
