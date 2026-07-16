import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

const COLORS: Record<ToastType, { bg: string; fg: string; icon: string }> = {
  success: { bg: '#eaf5ef', fg: '#14664a', icon: '#1f8a5b' },
  error: { bg: '#fdeceb', fg: '#8a2f2a', icon: '#d9534f' },
  info: { bg: '#eef4f9', fg: '#1e4a72', icon: '#3b82c4' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast]);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 360,
        }}
      >
        {toasts.map((t) => {
          const c = COLORS[t.type];
          return (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                background: '#fff',
                border: `1px solid ${c.bg}`,
                borderLeft: `4px solid ${c.icon}`,
                borderRadius: 10,
                padding: '12px 14px',
                boxShadow: '0 6px 20px rgba(23,37,30,.12)',
                cursor: 'pointer',
                animation: 'toast-in .2s ease-out',
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  flex: 'none',
                  borderRadius: '50%',
                  background: c.bg,
                  color: c.icon,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {ICONS[t.type]}
              </span>
              <span style={{ fontSize: 13, color: c.fg, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{t.message}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
