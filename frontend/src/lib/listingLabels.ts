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
