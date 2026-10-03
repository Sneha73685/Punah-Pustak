import type { BadgeTone } from "@/components/Badge";
import type { ListingCategory, ListingCondition, ListingStatus } from "@/api/types";

/** §10.3's fixed category list, given human-readable labels once here
 * rather than re-formatting the enum's snake_case value at every call site. */
export const CATEGORY_LABELS: Record<ListingCategory, string> = {
  fiction: "Fiction",
  non_fiction: "Non-fiction",
  academic_textbook: "Academic textbook",
  children: "Children's",
  comics_graphic_novels: "Comics & graphic novels",
  other: "Other",
};

export const CONDITION_LABELS: Record<ListingCondition, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

/** What each condition grade means, shown beside the grade on the detail
 * page and under the condition picker when listing a book, so buyer and
 * seller read the same definition. These describe the app's own grading
 * scale; they don't assert anything about a particular copy. */
export const CONDITION_DESCRIPTIONS: Record<ListingCondition, string> = {
  new: "Unread. No marks, wear, or damage.",
  like_new: "Read, but shows almost no wear.",
  good: "Normal signs of reading, like a creased spine or shelf wear. Complete and clean.",
  fair: "Heavily read: worn cover, markings, or yellowed pages. Complete and readable.",
  poor: "Significant wear or damage. Check the description before buying.",
};

export const STATUS_LABELS: Record<ListingStatus, string> = {
  available: "Available",
  sold: "Sold",
  deleted: "Removed",
};

export const STATUS_TONES: Record<ListingStatus, BadgeTone> = {
  available: "success",
  sold: "neutral",
  deleted: "danger",
};

/** AS-1: single currency, single locale for v2.1.0 — the backend stores a
 * bare `numeric(10,2)` with no currency code, so `$` is hardcoded here
 * rather than built as a configurable/localized feature nothing else in
 * the system supports yet. */
export function formatPrice(price: string): string {
  const amount = Number.parseFloat(price);
  return Number.isNaN(amount) ? price : `$${amount.toFixed(2)}`;
}

/** The condition grades as a five-step scale (5 = New), for the
 * `ConditionMeter`. Best first, which is also the order filters list them. */
export const CONDITION_SCORE: Record<ListingCondition, number> = {
  new: 5,
  like_new: 4,
  good: 3,
  fair: 2,
  poor: 1,
};

export const CONDITIONS_BEST_FIRST: ListingCondition[] = ["new", "like_new", "good", "fair", "poor"];

/** "3 Oct 2026": the record-line date format. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "March 2025": seller membership. */
export function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** Whether a seller's description says enough to quote on a listing card.
 * Short notes ("Read once.") still appear in full on the detail page; a
 * card only borrows the voice when there is something to hear. */
export function isSubstantiveNote(description: string): boolean {
  return description.trim().length >= 28;
}
