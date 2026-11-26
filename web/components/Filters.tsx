import { RefreshCw } from 'lucide-react';
import type { ScrapeStatusResponse } from '../../src/shared/api';
import { LiveStatus } from './LiveStatus';

export type Preset = 'thisWeek' | 'lastWeek' | 'last30' | 'all' | 'custom';

const PRESETS: { key: Exclude<Preset, 'custom'>; label: string }[] = [
  { key: 'thisWeek', label: 'This week' },
  { key: 'lastWeek', label: 'Last week' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

interface Props {
  preset: Preset;
  onPresetChange: (preset: Preset) => void;
  properties: { id: string; shortName: string }[];
  property: string;
  onPropertyChange: (property: string) => void;
  from: string;
  to: string;
  onCustomRange: (from: string, to: string) => void;
  lastScrapedAt: string | null;
  status: ScrapeStatusResponse | null;
  refreshing: boolean;
  onRefresh: () => void;
}

export function Filters({
  preset,
  onPresetChange,
  properties,
  property,
  onPropertyChange,
  from,
  to,
  onCustomRange,
  lastScrapedAt,
  status,
  refreshing,
  onRefresh,
}: Props) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">Period</span>
        <div className="segmented" role="group" aria-label="Date period">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={preset === item.key ? 'segment active' : 'segment'}
              onClick={() => onPresetChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <label className="filter-group">
        <span className="filter-label">Property</span>
        <select value={property} onChange={(event) => onPropertyChange(event.target.value)} aria-label="Filter by property">
          <option value="all">All properties</option>
          {properties.map((item) => (
            <option key={item.id} value={item.id}>{item.shortName}</option>
          ))}
        </select>
      </label>

      <div className="filter-group date-group">
        <span className="filter-label">Custom range</span>
        <div className="date-inputs">
          <input
            type="date"
            value={from}
            max={to}
            aria-label="From date"
            onChange={(event) => onCustomRange(event.target.value, to)}
          />
          <span aria-hidden="true">→</span>
          <input
            type="date"
            value={to}
            min={from}
            aria-label="To date"
            onChange={(event) => onCustomRange(from, event.target.value)}
          />
        </div>
      </div>

      <div className="filter-group refresh-group">
        <span className="filter-label">Data</span>
        <button type="button" className="refresh-button" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Check for new reviews'}
        </button>
        <LiveStatus status={status} />
      </div>
    </div>
  );
}
