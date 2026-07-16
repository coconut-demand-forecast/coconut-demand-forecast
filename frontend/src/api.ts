import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Sentinel location value meaning "combine every location into one
 * national series" — matches the backend's ALL_LOCATIONS constant. */
export const ALL_LOCATIONS = '__all__';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface User {
  id: number;
  name: string;
  organization: string;
  contact: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface DashboardSummary {
  total_records: number;
  usable_rows_for_training: number;
  min_usable_rows_required: number;
  avg_demand_30d: number | null;
  avg_price_30d: number | null;
  growth_pct: number | null;
  best_model: string | null;
  best_mape: number | null;
  best_r2: number | null;
  train_size: number | null;
  test_size: number | null;
  last_trained_at: string | null;
  last_forecast_horizon_days: number | null;
}

export interface DemandSeriesPoint {
  date: string;
  demand: number;
}

export interface ChannelBreakdown {
  channel: string;
  total_demand: number;
  pct: number;
}

export interface SeasonalPoint {
  month: string;
  avg_demand: number;
}

export interface ModelMetrics {
  model_type: string;
  train_size: number | null;
  test_size: number | null;
  mae: number;
  rmse: number;
  mape: number;
  r2: number;
  feature_importance: Record<string, number>;
  parameters: Record<string, number> | null;
  hyperparameters_tuned: boolean;
  trained_at: string;
}

export interface TrainResponse {
  results: ModelMetrics[];
  best_model: string;
  best_model_reason: string;
}

export interface ForecastPoint {
  date: string;
  predicted: number;
  lower: number;
  upper: number;
}

export interface ForecastSummary {
  mean: number;
  max: number;
  min: number;
  trend: 'increasing' | 'decreasing' | 'flat';
  trend_pct: number;
}

export interface ForecastResponse {
  model_type: string;
  horizon_days: number;
  points: ForecastPoint[];
  assumptions: string;
  summary: ForecastSummary;
  train_size: number;
  test_size: number;
  mae: number;
  rmse: number;
  mape: number;
  r2: number;
  trained_at: string;
}

export interface TestPredictionPoint {
  date: string;
  actual: number;
  predicted: number;
  error: number;
}

export interface TestPredictionsResponse {
  model_type: string;
  train_size: number;
  test_size: number;
  points: TestPredictionPoint[];
}

export interface DataQualitySummary {
  count: number;
  date_from: string | null;
  date_to: string | null;
  missing_value_rows: number;
  duplicate_date_rows: number;
  outlier_rows: number;
  usable_rows_for_training: number;
  min_raw_rows_required: number;
  ready_for_training: boolean;
  reason: string | null;
}

export interface UploadResult {
  dry_run: boolean;
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  missing_value_rows: number;
  invalid_date_rows: number;
  invalid_demand_rows: number;
  negative_demand_rows: number;
  duplicate_date_rows: number;
  existing_rows_to_replace: number;
  warnings: string[];
}

export interface DemandRecord {
  id: number;
  date: string;
  location: string | null;
  demand: number;
  avg_price: number | null;
  cost_price: number | null;
  production_volume: number | null;
  season: string | null;
  channel: string | null;
  is_holiday: boolean;
  has_promotion: boolean;
}

export interface LocationCompareItem {
  location: string;
  record_count: number;
  avg_demand: number;
  best_model: string | null;
  best_mape: number | null;
  best_rmse: number | null;
  best_r2: number | null;
}

export interface LocationCompareResponse {
  locations: LocationCompareItem[];
}

export const authApi = {
  register: (data: { name: string; organization: string; contact: string; password: string }) =>
    api.post<TokenResponse>('/api/auth/register', data).then((r) => r.data),
  login: (data: { contact: string; password: string }) =>
    api.post<TokenResponse>('/api/auth/login', data).then((r) => r.data),
  me: () => api.get<User>('/api/auth/me').then((r) => r.data),
};

export const dataApi = {
  upload: (file: File, dryRun: boolean) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<UploadResult>('/api/data/upload', form, {
        params: { dry_run: dryRun },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  loadSample: () => api.post<UploadResult>('/api/data/load-sample').then((r) => r.data),
  summary: () => api.get('/api/data/summary').then((r) => r.data),
  quality: (location?: string) =>
    api.get<DataQualitySummary>('/api/data/quality', { params: { location } }).then((r) => r.data),
  records: (limit = 20, location?: string) =>
    api.get<DemandRecord[]>('/api/data/records', { params: { limit, location } }).then((r) => r.data),
  locations: () =>
    api.get<{ locations: string[] }>('/api/data/locations').then((r) => r.data.locations),
  clear: () => api.delete('/api/data/records').then((r) => r.data),
  exportUrl: (location?: string) =>
    `${API_URL}/api/data/export${location ? `?location=${encodeURIComponent(location)}` : ''}`,
};

export const mlApi = {
  train: (models: string[], horizonDays: number, location?: string) =>
    api
      .post<TrainResponse>(
        '/api/ml/train',
        { models, horizon_days: horizonDays },
        { params: { location } }
      )
      .then((r) => r.data),
  compare: (location?: string) =>
    api.get<TrainResponse>('/api/ml/compare', { params: { location } }).then((r) => r.data),
  forecast: (model: string, horizonDays: number, location?: string) =>
    api
      .get<ForecastResponse>('/api/ml/forecast', { params: { model, horizon_days: horizonDays, location } })
      .then((r) => r.data),
  testPredictions: (model: string, location?: string) =>
    api
      .get<TestPredictionsResponse>('/api/ml/test-predictions', { params: { model, location } })
      .then((r) => r.data),
  forecastExportUrl: (model: string, horizonDays: number, location?: string) =>
    `${API_URL}/api/ml/forecast/export?model=${model}&horizon_days=${horizonDays}` +
    (location ? `&location=${encodeURIComponent(location)}` : ''),
  compareExportUrl: (location?: string) =>
    `${API_URL}/api/ml/compare/export` + (location ? `?location=${encodeURIComponent(location)}` : ''),
};

export const dashboardApi = {
  summary: (location?: string) =>
    api.get<DashboardSummary>('/api/dashboard/summary', { params: { location } }).then((r) => r.data),
  demandSeries: (days = 180, location?: string) =>
    api
      .get<DemandSeriesPoint[]>('/api/dashboard/demand-series', { params: { days, location } })
      .then((r) => r.data),
  channelBreakdown: (location?: string) =>
    api
      .get<ChannelBreakdown[]>('/api/dashboard/channel-breakdown', { params: { location } })
      .then((r) => r.data),
  seasonalPattern: (location?: string) =>
    api
      .get<SeasonalPoint[]>('/api/dashboard/seasonal-pattern', { params: { location } })
      .then((r) => r.data),
};

export const locationsApi = {
  compare: (trainMissing = true) =>
    api
      .get<LocationCompareResponse>('/api/locations/compare', { params: { train_missing: trainMissing } })
      .then((r) => r.data),
};
