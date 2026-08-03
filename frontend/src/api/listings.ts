import { apiFetch } from "@/api/client";
import type {
  ListingCategory,
  ListingCondition,
  ListingCreate,
  ListingImagePublic,
  ListingPage,
  ListingPublic,
  ListingUpdate,
} from "@/api/types";

export interface BrowseFilters {
  search?: string;
  category?: ListingCategory;
  condition?: ListingCondition;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}

/** FR-001..004: public browse/search/filter, paginated. */
export function browseListings(filters: BrowseFilters = {}): Promise<ListingPage> {
  return apiFetch<ListingPage>("/api/v1/listings", {
    query: {
      search: filters.search,
      category: filters.category,
      condition: filters.condition,
      min_price: filters.minPrice,
      max_price: filters.maxPrice,
      page: filters.page,
      page_size: filters.pageSize,
    },
  });
}

/** FR-005/FR-006a: detail view — 404s for a deleted listing unless the
 * caller is its owner or an admin (enforced server-side; this function
 * just surfaces whatever the API returns). */
export function getListing(id: string): Promise<ListingPublic> {
  return apiFetch<ListingPublic>(`/api/v1/listings/${id}`);
}

export function createListing(body: ListingCreate): Promise<ListingPublic> {
  return apiFetch<ListingPublic>("/api/v1/listings", { method: "POST", json: body });
}

export function updateListing(id: string, body: ListingUpdate): Promise<ListingPublic> {
  return apiFetch<ListingPublic>(`/api/v1/listings/${id}`, { method: "PATCH", json: body });
}

export function deleteListing(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/listings/${id}`, { method: "DELETE" });
}

export function markListingSold(id: string): Promise<ListingPublic> {
  return apiFetch<ListingPublic>(`/api/v1/listings/${id}/sold`, { method: "POST" });
}

/** API-030: one or more images in a single multipart request. */
export function uploadListingImages(id: string, files: File[]): Promise<ListingImagePublic[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("images", file);
  }
  return apiFetch<ListingImagePublic[]>(`/api/v1/listings/${id}/images`, {
    method: "POST",
    body: formData,
  });
}

/** FR-025: every status, unfiltered. */
export function getMyListings(): Promise<ListingPublic[]> {
  return apiFetch<ListingPublic[]>("/api/v1/users/me/listings");
}
