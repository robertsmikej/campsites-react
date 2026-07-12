import { GearItem } from '../types';

function searchQuery(item: GearItem): string {
  return [item.brand, item.name].filter(Boolean).join(' ');
}

/** Amazon search link carrying the user's affiliate tag (Amazon Associates). */
export function amazonAffiliateUrl(item: GearItem, tag: string): string {
  const params = new URLSearchParams({ k: searchQuery(item) });
  if (tag.trim()) params.set('tag', tag.trim());
  return `https://www.amazon.com/s?${params.toString()}`;
}

export function reiSearchUrl(item: GearItem): string {
  return `https://www.rei.com/search?q=${encodeURIComponent(searchQuery(item))}`;
}

export function youtubeReviewsUrl(item: GearItem): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    searchQuery(item) + ' review',
  )}`;
}

export function googleReviewsUrl(item: GearItem): string {
  return `https://www.google.com/search?q=${encodeURIComponent(searchQuery(item) + ' review')}`;
}
