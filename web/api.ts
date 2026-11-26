import type {
  InsightsResponse,
  MetaResponse,
  ReviewsResponse,
  ScrapeStatusResponse,
  SummaryResponse,
} from '../src/shared/api';

export type ApiParams = Record<string, string | number | undefined>;

async function getJson<T>(path: string, params: ApiParams = {}, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString() ? `?${query}` : '';
  const response = await fetch(`${path}${suffix}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  meta: (signal?: AbortSignal) => getJson<MetaResponse>('/api/meta', {}, signal),
  summary: (params: ApiParams, signal?: AbortSignal) => getJson<SummaryResponse>('/api/summary', params, signal),
  insights: (params: ApiParams, signal?: AbortSignal) => getJson<InsightsResponse>('/api/insights', params, signal),
  reviews: (params: ApiParams, signal?: AbortSignal) => getJson<ReviewsResponse>('/api/reviews', params, signal),
  status: (signal?: AbortSignal) => getJson<ScrapeStatusResponse>('/api/status', {}, signal),
  async refresh(): Promise<{ ok: boolean; reviewsNew: number; totalReviews: number; error?: string | null }> {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxPages: 10 }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Could not start a refresh.');
    return body;
  },
};
