import { useEffect, useState } from 'react';
import { ALL_LOCATIONS, dataApi } from '../api';
import { useLanguage } from '../context/LanguageContext';

/**
 * Fetches the distinct locations present in the user's data and lets them
 * pick one. Renders nothing when the data has no location column at all
 * (single-series / legacy dataset) so those flows are unaffected.
 */
export default function LocationSelector({
  value,
  onChange,
  onReady,
}: {
  value: string | undefined;
  onChange: (location: string | undefined) => void;
  /** Fires once, after the initial location list has been fetched (even if empty), so callers can gate actions that depend on knowing the resolved location first. */
  onReady?: (location: string | undefined) => void;
}) {
  const { t } = useLanguage();
  const [locations, setLocations] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    dataApi
      .locations()
      .then((locs) => {
        setLocations(locs);
        // With 2+ real locations, default to the combined "All" view;
        // with just one, "All" would be identical so skip straight to it.
        const resolved = locs.length > 1 ? ALL_LOCATIONS : locs.length === 1 ? locs[0] : undefined;
        if (resolved && !value) onChange(resolved);
        onReady?.(resolved);
      })
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded || locations.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--c-text-muted)', fontWeight: 600 }}>{t('locationLabel')}</span>
      <select
        value={value ?? (locations.length > 1 ? ALL_LOCATIONS : locations[0])}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: '1px solid var(--c-border)',
          borderRadius: 9,
          padding: '7px 12px',
          fontSize: 13,
          fontFamily: 'inherit',
          color: 'var(--c-text-soft)',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        {locations.length > 1 && <option value={ALL_LOCATIONS}>{t('locationAll')}</option>}
        {locations.map((loc) => (
          <option key={loc} value={loc}>
            {loc}
          </option>
        ))}
      </select>
    </div>
  );
}
