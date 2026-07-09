import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  avg_demand_30d: number | null;
  avg_price_30d: number | null;
  growth_pct: number | null;
  best_model: string | null;
  best_r2: number | null;
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
  mae: number;
  rmse: number;
  mape: number;
  r2: number;
  feature_importance: Record<string, number>;
  trained_at: string;
}

export interface TrainResponse {
  results: ModelMetrics[];
  best_model: string;
}

export interface ForecastPoint {
  date: string;
  predicted: number;
  lower: number;
  upper: number;
}

export interface ForecastResponse {
  model_type: string;
  horizon_days: number;
  points: ForecastPoint[];
}

export interface DemandRecord {
  id: number;
  date: string;
  demand: number;
  avg_price: number | null;
  cost_price: number | null;
  production_volume: number | null;
  season: string | null;
  channel: string | null;
  is_holiday: boolean;
  has_promotion: boolean;
}

export const authApi = {
  register: (data: { name: string; organization: string; contact: string; password: string }) =>
    api.post<TokenResponse>('/api/auth/register', data).then((r) => r.data),
  login: (data: { contact: string; password: string }) =>
    api.post<TokenResponse>('/api/auth/login', data).then((r) => r.data),
  me: () => api.get<User>('/api/auth/me').then((r) => r.data),
};

export const dataApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post('/api/data/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
  loadSample: () => api.post('/api/data/load-sample').then((r) => r.data),
  summary: () => api.get('/api/data/summary').then((r) => r.data),
  records: (limit = 20) =>
    api.get<DemandRecord[]>('/api/data/records', { params: { limit } }).then((r) => r.data),
  clear: () => api.delete('/api/data/records').then((r) => r.data),
  exportUrl: () => `${API_URL}/api/data/export`,
};

export const mlApi = {
  train: (models: string[], horizonDays: number) =>
    api
      .post<TrainResponse>('/api/ml/train', { models, horizon_days: horizonDays })
      .then((r) => r.data),
  compare: () => api.get<TrainResponse>('/api/ml/compare').then((r) => r.data),
  forecast: (model: string, horizonDays: number) =>
    api
      .get<ForecastResponse>('/api/ml/forecast', { params: { model, horizon_days: horizonDays } })
      .then((r) => r.data),
};

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>('/api/dashboard/summary').then((r) => r.data),
  demandSeries: (days = 180) =>
    api
      .get<DemandSeriesPoint[]>('/api/dashboard/demand-series', { params: { days } })
      .then((r) => r.data),
  channelBreakdown: () =>
    api.get<ChannelBreakdown[]>('/api/dashboard/channel-breakdown').then((r) => r.data),
  seasonalPattern: () =>
    api.get<SeasonalPoint[]>('/api/dashboard/seasonal-pattern').then((r) => r.data),
};
