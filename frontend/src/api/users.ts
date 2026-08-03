import { apiFetch } from "@/api/client";
import type {
  ListingStatusSummary,
  PasswordChangeRequest,
  UserPublic,
  UserUpdate,
} from "@/api/types";

export function getOwnProfile(): Promise<UserPublic> {
  return apiFetch<UserPublic>("/api/v1/users/me");
}

export function updateOwnProfile(body: UserUpdate): Promise<UserPublic> {
  return apiFetch<UserPublic>("/api/v1/users/me", { method: "PATCH", json: body });
}

export function changeOwnPassword(body: PasswordChangeRequest): Promise<void> {
  return apiFetch<void>("/api/v1/users/me/password", { method: "POST", json: body });
}

export function getOwnListingsSummary(): Promise<ListingStatusSummary> {
  return apiFetch<ListingStatusSummary>("/api/v1/users/me/listings/summary");
}
