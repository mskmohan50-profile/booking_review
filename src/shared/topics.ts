/**
 * Transparent, deterministic topic tagging.
 *
 * This is deliberately keyword-based rather than an opaque model: operations
 * staff can see exactly why a review was tagged, the rules can be reviewed and
 * extended, and results are reproducible. See README for limitations.
 */
export interface TopicDefinition {
  key: string;
  label: string;
  description: string;
  patterns: RegExp[];
  /** Phrases that must count even when a generic negation guard would skip them. */
  overrides?: RegExp[];
}

export const TOPICS: TopicDefinition[] = [
  {
    key: 'cleanliness',
    label: 'Cleanliness',
    description: 'Dirty rooms or bathrooms, smells, mould, pests, missed housekeeping',
    patterns: [
      /\b(clean(?:ed|ing|liness)?|dirty|filthy|grubby|unhygienic|hygiene|stain(?:ed|s)?|mould|mold|dust(?:y)?|hair|smell(?:y|ed)?|odou?r|cobweb|cockroach|bug|insect|housekeeping|not\s+clean(?:ed)?)\b/i,
    ],
    overrides: [/\b(?:not|wasn't|weren't|isn't|was not|were not)\s+(?:clean(?:ed)?|cleanliness)\b/i, /\b(?:dirty|filthy|grubby|smell(?:y)?|mould|mold|cockroach)\b/i],
  },
  {
    key: 'check_in',
    label: 'Check-in experience',
    description: 'Arrival, keys, remote/virtual reception, check-in and check-out process',
    patterns: [
      /\b(check[\s-]?in|check[\s-]?out|checking in|arriv(?:e|al|ed|ing)|key ?card|front desk|virtual reception|remote reception|online log ?in|log ?in|reception(?:ist)?)\b/i,
    ],
    overrides: [/\b(?:no|without|difficulty|hard to|couldn't|could not)\s+(?:check[\s-]?in|key ?card|reception)\b/i],
  },
  {
    key: 'staff',
    label: 'Staff & reception',
    description: 'Attitude, helpfulness and behaviour of staff or management',
    patterns: [
      /\b(staff|receptionist|manager|employee|team|host|concierge|service|friendly|welcoming|rude|unhelpful|helpful|attitude|customer service)\b/i,
    ],
  },
  {
    key: 'noise',
    label: 'Noise',
    description: 'Loud rooms, slamming doors, thin walls, traffic or disturbed sleep',
    patterns: [
      /\b(noise|noisy|loud|slam(?:s|ming|med)?|thin walls|soundproof|sound proof|music|construction|traffic noise|woke|woken|kept awake|disturbed|sleep(?:less|ing)?)\b/i,
    ],
  },
  {
    key: 'facilities',
    label: 'Facilities',
    description: 'Air conditioning, lift, kitchen, laundry, parking and shared spaces',
    patterns: [
      /\b(facilit(?:y|ies)|air[\s-]?con(?:ditioning)?|lift|elevator|kitchen|kettle|laundry|parking|pool|gym|microwave|fridge|refrigerator|toaster|shared (?:room|bathroom|kitchen)|common area|lobby)\b/i,
    ],
    overrides: [/\b(?:no|without|lack of|missing|broken)\s+(?:air[\s-]?con|lift|elevator|kettle|kitchen|parking|facilities)\b/i],
  },
  {
    key: 'location',
    label: 'Location',
    description: 'Walkability, transport links, nearby venues and neighbourhood',
    patterns: [
      /\b(location|located|central|walk(?:ing|able)? distance|transport|station|nearby|close to|convenient|stadium|sydney|cbd|airport|beach)\b/i,
    ],
  },
  {
    key: 'room_condition',
    label: 'Room condition',
    description: 'Bed, furniture, maintenance, size, doors, windows and general upkeep',
    patterns: [
      /\b(room|bed|mattress|pillow|furniture|carpet|window|door|balcony|dated|tired|run[\s-]?down|renovat(?:e|ed|ion)?|maintenance|broken|stuffy|cramped|small room|furnishings|shower|bathroom)\b/i,
    ],
  },
  {
    key: 'value_for_money',
    label: 'Value for money',
    description: 'Price, extras, perceived value and billing',
    patterns: [
      /\b(price|priced|value|expensive|cheap|cost|worth|money|overpriced|budget|rate|pay(?:ed|ing)?|charge(?:d)?|fee)\b/i,
    ],
  },
  {
    key: 'comfort',
    label: 'Comfort',
    description: 'Bed comfort, temperature and general comfort',
    patterns: [/\b(comfortable|comfort|uncomfortable|hard bed|soft bed|firm bed|bed was|mattress|pillow|hot room|cold room|stuffy)\b/i],
  },
  {
    key: 'wifi',
    label: 'Wi-Fi / internet',
    description: 'Wi-Fi availability, speed and reliability',
    patterns: [/\b(wifi|wi-fi|internet|broadband|connection)\b/i],
  },
  {
    key: 'bathroom',
    label: 'Bathroom',
    description: 'Bathroom layout, showers, plumbing and amenities',
    patterns: [/\b(bathroom|shower|toilet|sink|tap|plumbing|drain|towels?|soap|toiletries)\b/i],
  },
  {
    key: 'safety',
    label: 'Safety & privacy',
    description: 'Security, locks, identification requests and personal safety',
    patterns: [/\b(unsafe|safety|secure|security|locked|lock|facial|identification|\bid\b|stranger|smoke alarm)\b/i],
  },
];

export const TOPIC_KEYS = TOPICS.map((topic) => topic.key);

export function topicByKey(key: string): TopicDefinition | undefined {
  return TOPICS.find((topic) => topic.key === key);
}

export interface ClassifiableReview {
  score: number;
  title: string;
  positiveText: string;
  negativeText: string;
}

export type Sentiment = 'negative' | 'neutral' | 'positive';

/** Booking.com scores are 1-10; <=6 is treated as requiring operational attention. */
export function sentimentForScore(score: number): Sentiment {
  if (score <= 6) return 'negative';
  if (score >= 8) return 'positive';
  return 'neutral';
}

/** True when the match appears to be negated ("no lift", "not noisy"). */
function isNegated(text: string, start: number): boolean {
  // Only inspect the current sentence: "Not great. Friendly staff" must not
  // suppress the staff topic in the second sentence.
  const boundaries = ['.', '!', '?', '\n'].map((character) => text.lastIndexOf(character, start - 1));
  const sentenceStart = Math.max(...boundaries) + 1;
  const before = text.slice(Math.max(sentenceStart, start - 45), start);
  return /\b(?:no|not|never|without|wasn't|weren't|isn't|aren't|didn't|doesn't|hardly|barely)\b[\s\S]{0,28}$/i.test(before);
}

function topicMatches(topic: TopicDefinition, text: string): boolean {
  if (!text.trim()) return false;
  if (topic.overrides?.some((pattern) => pattern.test(text))) return true;
  for (const pattern of topic.patterns) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = global.exec(text)) !== null) {
      if (!isNegated(text, match.index)) return true;
    }
  }
  return false;
}

export function topicsInText(text: string): string[] {
  return TOPICS.filter((topic) => topicMatches(topic, text)).map((topic) => topic.key);
}

export interface Classification {
  sentiment: Sentiment;
  topics: string[];
  negativeTopics: string[];
  positiveTopics: string[];
}

/**
 * `negativeTopics` only looks at the "what could be improved" field plus the
 * title, so a positive mention in the same review cannot be reported as an
 * operational issue.
 */
export function classifyReview(review: ClassifiableReview): Classification {
  const title = review.title ?? '';
  const positive = review.positiveText ?? '';
  const negative = review.negativeText ?? '';
  const negativeEvidence = `${title}. ${negative}`;
  const positiveEvidence = `${title}. ${positive}`;
  return {
    sentiment: sentimentForScore(review.score),
    topics: topicsInText(`${title}. ${positive}. ${negative}`),
    negativeTopics: topicsInText(negativeEvidence),
    positiveTopics: topicsInText(positiveEvidence),
  };
}
