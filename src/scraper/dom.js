export function extractReviewCardsFromDom() {
  const text = (card, testId) =>
    card.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  return Array.from(document.querySelectorAll('[data-testid="review-card"]')).map((card) => {
    const reviewerGroup = card.querySelector('[role="group"][aria-label="Reviewer"]');
    const flag = reviewerGroup?.querySelector('img[src*="images-flags"]');
    const scoreText = text(card, 'review-score');
    const scoreMatch = scoreText.match(/\b(\d+(?:\.\d+)?)\b/);
    const nightsText = text(card, 'review-num-nights');
    const nightsMatch = nightsText.match(/(\d+)\s+night/i);

    return {
      reviewerName: reviewerGroup?.querySelector('h4')?.textContent?.trim() ?? '',
      reviewerCountry: flag?.nextElementSibling?.textContent?.trim() ?? '',
      rawDate: text(card, 'review-date'),
      reviewDate: null,
      title: text(card, 'review-title'),
      score: scoreMatch ? Number(scoreMatch[1]) : null,
      positiveText: text(card, 'review-positive-text'),
      negativeText: text(card, 'review-negative-text'),
      roomType: text(card, 'review-room-name'),
      nights: nightsMatch ? Number(nightsMatch[1]) : null,
      stayDate: text(card, 'review-stay-date'),
      travelerType: text(card, 'review-traveler-type'),
      hasPropertyReply: Boolean(
        card.querySelector('[data-testid="review-partner-reply"]') ||
        card.textContent?.includes('Hotel response:'),
      ),
    };
  });
}

export function extractPropertySummaryFromDom() {
  const overallText = document.querySelector('[data-testid="review-score-component"]')?.textContent ?? '';
  const overallMatch = overallText.match(/\b(\d+(?:\.\d+)?)\b/);
  const headerText = document.querySelector('[data-testid="Property-Header-Nav-Tab-Trigger-reviews"]')?.textContent ?? '';
  const countMatch = headerText.match(/(\d[\d,]*)\s+reviews?/i) ?? overallText.match(/(\d[\d,]*)\s+reviews?/i);

  const subscores = Array.from(document.querySelectorAll('[data-testid="review-subscore"]'))
    .map((element) => {
      const content = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const match = content.match(/^([^,]+),\s*(\d+(?:\.\d+)?)/);
      if (!match) return null;
      return { label: match[1].trim(), score: Number(match[2]) };
    })
    .filter((value) => value !== null);

  return {
    overallScore: overallMatch ? Number(overallMatch[1]) : null,
    reviewCount: countMatch ? Number(countMatch[1].replace(/,/g, '')) : null,
    subscores,
  };
}
