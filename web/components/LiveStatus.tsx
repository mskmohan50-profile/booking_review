import type { ScrapeStatusResponse } from '../../src/shared/api';

function relative(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(Math.abs(diffMs) / 60_000);
  const future = diffMs < 0;
  if (minutes < 1) return future ? 'in a moment' : 'just now';
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}

export function LiveStatus({ status }: { status: ScrapeStatusResponse | null }) {
  if (!status) return <small className="freshness">Connecting to live status…</small>;

  if (status.running) {
    return (
      <small className="freshness live" role="status">
        <span className="dot pulsing" />
        {status.message}
      </small>
    );
  }

  const last = status.lastRun;
  const summary = last
    ? `Checked ${relative(last.finishedAt)} · ${last.reviewsNew} new review${last.reviewsNew === 1 ? '' : 's'}`
    : 'No collection run yet';
  const error = status.phase === 'error' && last?.error ? ` · ${last.error}` : '';
  const next = status.autoRefresh.enabled ? ` · next ${relative(status.autoRefresh.nextRunAt)}` : ' · auto-check off';

  return (
    <small
      className={status.phase === 'error' ? 'freshness has-error' : 'freshness'}
      title={`${summary}${error}${next}`}
      aria-live="polite"
    >
      {summary}{error}{next}
    </small>
  );
}
