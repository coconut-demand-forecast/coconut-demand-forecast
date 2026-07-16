export default function Spinner({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <>
      <span
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          border: `2px solid ${color}`,
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin-rotate .7s linear infinite',
          flex: 'none',
        }}
      />
      <style>{`
        @keyframes spin-rotate {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
