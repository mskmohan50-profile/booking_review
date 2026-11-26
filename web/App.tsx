import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, Building2, TrendingUp } from 'lucide-react';
import { api } from './api';
import type { InsightsResponse, MetaResponse, ScrapeStatusResponse, SummaryResponse } from '../src/shared/api';
import { addDays, formatShortDate, startOfWeek, toSydneyDate } from '../src/shared/dates';
import { Filters, type Preset } from './components/Filters';
import { Kpis } from './components/Kpis';
import { PropertyIssues, TopicBars } from './components/InsightPanels';
import { ReviewFeed, type FeedFilters, type FeedReview } from './components/ReviewFeed';
import { Methodology } from './components/Methodology';

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="panel-subtitle">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const today = useMemo(() => toSydneyDate(), []);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof api.reviews>> | null>(null);
  const [status, setStatus] = useState<ScrapeStatusResponse | null>(null);
  const [demoLive, setDemoLive] = useState(false);
  const [demoReviews, setDemoReviews] = useState<FeedReview[]>([]);
  const seenRunRef = useRef<string | null>(null);
  const seenStatusRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [preset, setPreset] = useState<Preset>('last30');
  const [property, setProperty] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [topic, setTopic] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [feedPage, setFeedPage] = useState(1);

  useEffect(() => {
    api.meta().then(setMeta).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [refreshKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput), 120);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    const poll = () => api.status(controller.signal)
      .then((data) => {
        setStatus(data);
        const finished = data.lastRun?.finishedAt ?? null;
        if (!seenStatusRef.current) {
          seenStatusRef.current = true;
          seenRunRef.current = finished;
          return;
        }
        if (finished && finished !== seenRunRef.current) {
          seenRunRef.current = finished;
          setRefreshKey((value) => value + 1);
        }
      })
      .catch(() => undefined);
    void poll();
    const interval = window.setInterval(() => void poll(), 2500);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const range = useMemo(() => {
    const weekStart = startOfWeek(today);
    if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
    if (preset === 'thisWeek') return { from: weekStart, to: today };
    if (preset === 'lastWeek') return { from: addDays(weekStart, -7), to: addDays(weekStart, -1) };
    if (preset === 'all') return { from: meta?.freshness.earliestReviewDate ?? addDays(today, -365), to: today };
    return { from: addDays(today, -29), to: today };
  }, [preset, customFrom, customTo, today, meta]);

  const commonParams = useMemo(
    () => ({ from: range.from, to: range.to, property: property === 'all' ? undefined : property }),
    [range.from, range.to, property],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      api.summary(commonParams, controller.signal),
      api.insights(commonParams, controller.signal),
    ])
      .then(([summaryData, insightsData]) => {
        setSummary(summaryData);
        setInsights(insightsData);
        setError(null);
      })
      .catch((cause) => {
        if (cause?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [commonParams, refreshKey]);

  useEffect(() => {
    setFeedPage(1);
    setDemoReviews([]);
  }, [range.from, range.to, property, search, sentiment, topic, sort]);

  useEffect(() => {
    const controller = new AbortController();
    setFeedLoading(true);
    api.reviews({
      ...commonParams,
      search,
      sentiment,
      topic,
      sort,
      page: feedPage,
      limit: 25,
    }, controller.signal)
      .then(setReviews)
      .catch((cause) => {
        if (cause?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setFeedLoading(false));
    return () => controller.abort();
  }, [commonParams, search, sentiment, topic, sort, feedPage, refreshKey]);

  useEffect(() => {
    if (!demoLive) {
      setDemoReviews([]);
      return;
    }
    const pool = reviews?.items ?? [];
    if (pool.length === 0) return;

    const addDemoReview = () => {
      const source = pool[Math.floor(Math.random() * pool.length)];
      if (!source) return;
      const receivedAt = new Date().toISOString();
      setDemoReviews((current) => [
        {
          ...source,
          id: `demo-${receivedAt}-${Math.random().toString(36).slice(2, 8)}`,
          reviewDate: receivedAt.slice(0, 10),
          scrapedAt: receivedAt,
          demo: true,
        },
        ...current,
      ].slice(0, 3));
    };

    addDemoReview();
    const interval = window.setInterval(addDemoReview, 4000);
    return () => window.clearInterval(interval);
  }, [demoLive, reviews?.items]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await api.refresh();
      if (!result.ok) setError(result.error || 'Some properties could not be refreshed. Previous data has been kept.');
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  };

  const scrollToFeed = () => document.getElementById('review-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const selectTopic = (key: string) => {
    setTopic(key);
    setSentiment('negative');
    scrollToFeed();
  };
  const selectProperty = (id: string) => {
    setProperty(id);
    scrollToFeed();
  };

  const feedFilters: FeedFilters = { search: searchInput, sentiment, topic, sort };
  const propertyNames = Object.fromEntries((meta?.properties ?? []).map((item) => [item.id, item.shortName]));
  const topics = meta?.topics ?? [];
  const periodLabel = `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/book-logo.png" alt="Azzurro Hotels logo" />
          <div>
            <strong>Azzurro Hotels</strong>
            <span>Guest review insights</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="source-pill">Public Booking.com reviews</span>
          <span className="sync-pill">
            <span className={refreshing || status?.running ? 'dot pulsing' : 'dot'} />
            {refreshing || status?.running ? 'Collecting reviews…' : 'Live updates on'}
          </span>
        </div>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">Operations dashboard</p>
            <h1>Know what guests are telling you</h1>
            <p className="hero-copy">
              Weekly sentiment, property performance and recurring operational issues across four Sydney properties.
            </p>
          </div>
          <div className="hero-period">
            <span>Selected period</span>
            <strong>{periodLabel}</strong>
            <small>{summary?.freshness.totalReviews ?? 0} reviews in dataset</small>
          </div>
        </section>

        <Filters
          preset={preset}
          onPresetChange={setPreset}
          properties={meta?.properties ?? []}
          property={property}
          onPropertyChange={setProperty}
          from={range.from}
          to={range.to}
          onCustomRange={(from, to) => {
            if (from) setCustomFrom(from);
            if (to) setCustomTo(to);
            setPreset('custom');
          }}
          lastScrapedAt={meta?.freshness.lastScrapedAt ?? summary?.freshness.lastScrapedAt ?? null}
          status={status}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />

        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} /> {error}
            <button type="button" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        <Kpis summary={summary} />

        <section className="insight-banner">
          <div className="insight-icon"><TrendingUp size={22} /></div>
          <div className="insight-copy">
            <p className="eyebrow">Insight spotlight</p>
            <h2>{insights?.spotlight ?? 'Looking for recurring issues…'}</h2>
            <p className="muted">
              {insights?.negativeCount ?? 0} low-rated reviews in the selected period ·
              {' '}{insights?.positiveCount ?? 0} positive reviews
            </p>
          </div>
          <div className="insight-issues">
            <p className="eyebrow">Top issue by property</p>
            <PropertyIssues issues={insights?.perProperty ?? []} onSelect={selectProperty} />
          </div>
        </section>

        <div className="grid two-col">
          <Panel title="Average rating by property" subtitle={`Scores out of 10 for ${periodLabel}`}>
            {summary && summary.propertyBreakdown.some((item) => item.reviewCount > 0) ? (
              <>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={summary.propertyBreakdown} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} fontSize={12} />
                      <YAxis type="category" dataKey="shortName" width={118} fontSize={12} />
                      <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} / 10`, 'Average']} />
                      <Bar dataKey="averageScore" radius={[0, 6, 6, 0]} barSize={22}>
                        {summary.propertyBreakdown.map((item) => <Cell key={item.propertyId} fill={item.accent} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className="mini-table">
                  <thead><tr><th>Property</th><th>Score</th><th>Reviews</th><th>vs previous</th></tr></thead>
                  <tbody>
                    {summary.propertyBreakdown.map((item) => (
                      <tr key={item.propertyId}>
                        <td>{item.shortName}</td>
                        <td>{item.averageScore === null ? '—' : item.averageScore.toFixed(2)}</td>
                        <td>{item.reviewCount}</td>
                        <td className={item.delta !== null && item.delta >= 0 ? 'text-good' : 'text-bad'}>
                          {item.delta === null ? '—' : `${item.delta > 0 ? '+' : ''}${item.delta.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <p className="empty-state">No reviews in this period for the selected properties.</p>}
          </Panel>

          <Panel title="Weekly rating trend" subtitle="Eight weeks of guest scores; gaps mean no reviews were published">
            {summary && summary.weeklyTrend.some((item) => item.reviewCount > 0) ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={summary.weeklyTrend} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} fontSize={12} />
                    <Tooltip formatter={(value, _name, entry) => [
                      value === null || value === undefined ? 'No reviews' : `${Number(value).toFixed(2)} / 10`,
                      `${entry.payload.reviewCount} review${entry.payload.reviewCount === 1 ? '' : 's'}`,
                    ]} />
                    <Line type="monotone" dataKey="averageScore" stroke="#2563eb" strokeWidth={3} connectNulls dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="empty-state">Not enough reviews to draw a trend yet.</p>}
          </Panel>
        </div>

        <div className="grid two-col">
          <Panel title="Operational issues" subtitle="Topics mentioned in low-rated reviews (≤6/10). Click a topic to filter the feed.">
            <TopicBars
              topics={insights?.negativeTopics ?? []}
              tone="negative"
              emptyText="No recurring issues were found in this period."
              onSelect={selectTopic}
            />
          </Panel>

          <div className="stack">
            <Panel title="What guests praise" subtitle="Topics mentioned in positive reviews (≥8/10)">
              <TopicBars topics={insights?.positiveTopics ?? []} tone="positive" emptyText="No positive themes were found in this period." />
            </Panel>
            <Panel title="Rating distribution" subtitle="All reviews in the selected period">
              <div className="distribution">
                {(summary?.ratingDistribution ?? []).map((bucket) => {
                  const max = Math.max(...(summary?.ratingDistribution ?? []).map((item) => item.count), 1);
                  return (
                    <div className="distribution-row" key={bucket.label}>
                      <span>{bucket.label}</span>
                      <span className="distribution-track"><span style={{ width: `${(bucket.count / max) * 100}%` }} /></span>
                      <strong>{bucket.count}</strong>
                    </div>
                  );
                })}
              </div>
              <div className="chart-wrap sentiment-chart">
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={summary?.sentimentTrend ?? []} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="negativeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis domain={[0, 100]} fontSize={11} />
                    <Tooltip formatter={(value) => `${value === undefined ? '—' : Number(value).toFixed(0)}% low-rated`} />
                    <Area type="monotone" dataKey="negativePct" stroke="#ef4444" strokeWidth={2} fill="url(#negativeFill)" connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="chart-caption">Share of low-rated reviews by week</p>
              </div>
            </Panel>
          </div>
        </div>

        <ReviewFeed
          data={reviews}
          loading={feedLoading}
          topics={topics}
          propertyNames={propertyNames}
          filters={feedFilters}
          demoReviews={demoReviews}
          demoLive={demoLive}
          onToggleDemo={() => setDemoLive((value) => !value)}
          onFilterChange={(key, value) => {
            if (key === 'search') setSearchInput(value);
            if (key === 'sentiment') setSentiment(value);
            if (key === 'topic') setTopic(value);
            if (key === 'sort') setSort(value);
          }}
          onPageChange={setFeedPage}
        />

        <Methodology />

        <footer>
          <span><Building2 size={14} /> Azzurro Hotels · Operations review insights</span>
          <span>Sample data snapshot · {summary ? new Date(summary.generatedAt).toLocaleString() : 'loading…'}</span>
        </footer>
      </main>

      {loading && <div className="loading-overlay" role="status">Refreshing dashboard…</div>}
    </div>
  );
}
