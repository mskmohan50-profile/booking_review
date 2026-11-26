import { ArrowDownRight, ArrowUpRight, Minus, Star } from 'lucide-react';
import type { SummaryResponse } from '../../src/shared/api';

function scoreText(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

function pctText(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(0)}%`;
}

function Delta({ value, suffix = 'pts', invert = false }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null || Math.abs(value) < 0.005) {
    return <span className="delta neutral"><Minus size={13} /> No change</span>;
  }
  const good = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={good ? 'delta good' : 'delta bad'}>
      <Icon size={13} />
      {Math.abs(value).toFixed(1)} {suffix}
    </span>
  );
}

interface Props {
  summary: SummaryResponse | null;
}

export function Kpis({ summary }: Props) {
  if (!summary) return <div className="kpi-grid"><div className="kpi-card skeleton" /><div className="kpi-card skeleton" /><div className="kpi-card skeleton" /><div className="kpi-card skeleton" /></div>;

  const { thisWeek, lastWeek, current, previous, propertyBreakdown } = summary;
  const weekDelta = thisWeek.averageScore !== null && lastWeek.averageScore !== null
    ? thisWeek.averageScore - lastWeek.averageScore
    : null;
  const negativeDelta = current.negativePct !== null && previous.negativePct !== null
    ? current.negativePct - previous.negativePct
    : null;
  const reporting = propertyBreakdown.filter((property) => property.reviewCount > 0).length;

  return (
    <div className="kpi-grid">
      <article className="kpi-card primary">
        <div className="kpi-heading"><span>Average rating · this week</span><Star size={16} /></div>
        <div className="kpi-value">{scoreText(thisWeek.averageScore)}<small>/10</small></div>
        <div className="kpi-foot">
          <Delta value={weekDelta} suffix="vs last week" />
          <span className="muted">{thisWeek.reviewCount} review{thisWeek.reviewCount === 1 ? '' : 's'}</span>
        </div>
      </article>

      <article className="kpi-card">
        <div className="kpi-heading"><span>Reviews this week</span></div>
        <div className="kpi-value">{thisWeek.reviewCount}</div>
        <div className="kpi-foot">
          <span className="muted">Last week: {lastWeek.reviewCount}</span>
        </div>
      </article>

      <article className="kpi-card">
        <div className="kpi-heading"><span>Low-rated reviews</span></div>
        <div className="kpi-value">{pctText(current.negativePct)}<small>of reviews</small></div>
        <div className="kpi-foot">
          <Delta value={negativeDelta} invert />
          <span className="muted">{current.negativeCount} of {current.reviewCount}</span>
        </div>
      </article>

      <article className="kpi-card">
        <div className="kpi-heading"><span>Properties reporting</span></div>
        <div className="kpi-value">{reporting}<small>/ {propertyBreakdown.length || 4}</small></div>
        <div className="kpi-foot"><span className="muted">With reviews in selected period</span></div>
      </article>
    </div>
  );
}
