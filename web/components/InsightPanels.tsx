import { ChevronRight, Quote } from 'lucide-react';
import type { PropertyIssue, TopicInsight } from '../../src/shared/api';

interface TopicBarsProps {
  topics: TopicInsight[];
  tone: 'negative' | 'positive';
  emptyText: string;
  onSelect?: (key: string) => void;
}

export function TopicBars({ topics, tone, emptyText, onSelect }: TopicBarsProps) {
  if (topics.length === 0) return <p className="empty-state">{emptyText}</p>;
  const max = Math.max(...topics.map((topic) => topic.pct ?? 0), 1);

  return (
    <ul className="topic-list">
      {topics.slice(0, 7).map((topic) => (
        <li key={topic.key}>
          <button
            type="button"
            className="topic-row"
            onClick={() => onSelect?.(topic.key)}
            disabled={!onSelect}
            title={topic.exampleQuote ?? topic.description}
          >
            <span className="topic-label">{topic.label}</span>
            <span className="topic-track" aria-hidden="true">
              <span
                className={`topic-fill ${tone}`}
                style={{ width: `${((topic.pct ?? 0) / max) * 100}%` }}
              />
            </span>
            <span className="topic-pct">{topic.pct === null ? '—' : `${topic.pct.toFixed(0)}%`}</span>
            <span className="topic-count">{topic.count}</span>
            {topic.deltaPp !== null && Math.abs(topic.deltaPp) >= 0.5 && (
              <span className={tone === 'negative' ? (topic.deltaPp > 0 ? 'chip bad' : 'chip good') : (topic.deltaPp > 0 ? 'chip good' : 'chip bad')}>
                {topic.deltaPp > 0 ? '+' : ''}{topic.deltaPp.toFixed(0)} pts
              </span>
            )}
            <ChevronRight size={14} className="topic-chevron" />
          </button>
          {tone === 'negative' && topic.exampleQuote && (
            <p className="topic-quote"><Quote size={12} /> {topic.exampleQuote}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

interface PropertyIssuesProps {
  issues: PropertyIssue[];
  onSelect: (propertyId: string) => void;
}

export function PropertyIssues({ issues, onSelect }: PropertyIssuesProps) {
  return (
    <ul className="property-issues">
      {issues.map((issue) => (
        <li key={issue.propertyId}>
          <button type="button" onClick={() => onSelect(issue.propertyId)}>
            <span className="issue-name">{issue.name}</span>
            <span className="issue-topic">{issue.topicLabel ?? 'No recurring issue'}</span>
            <span className="issue-detail">
              {issue.topicLabel ? `${issue.topCount} of ${issue.negativeCount} low-rated reviews` : `${issue.negativeCount} low-rated reviews`}
            </span>
            <ChevronRight size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
