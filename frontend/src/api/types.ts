/**
 * API-021: convenience re-exports from the generated `components["schemas"]`
 * so the rest of the app imports `LoginRequest`/`ListingPublic`/etc.
 * directly instead of every call site spelling out
 * `components["schemas"]["X"]`. Still generated types, not hand-duplicated
 * ones — this file adds no shape of its own.
 */
import type { components } from "@/api/schema";

export type HealthResponse = components["schemas"]["HealthResponse"];

export type RegisterRequest = components["schemas"]["RegisterRequest"];
export type LoginRequest = components["schemas"]["LoginRequest"];
export type AccessTokenResponse = components["schemas"]["AccessTokenResponse"];

export type UserRole = components["schemas"]["RoleEnum"];
export type UserPublic = components["schemas"]["UserPublic"];
export type UserUpdate = components["schemas"]["UserUpdate"];
export type PasswordChangeRequest = components["schemas"]["PasswordChangeRequest"];

export type ListingCategory = components["schemas"]["ListingCategoryEnum"];
export type ListingCondition = components["schemas"]["ListingConditionEnum"];
export type ListingStatus = components["schemas"]["ListingStatusEnum"];
export type ListingCreate = components["schemas"]["ListingCreate"];
export type ListingUpdate = components["schemas"]["ListingUpdate"];
export type ListingPublic = components["schemas"]["ListingPublic"];
export type ListingImagePublic = components["schemas"]["ListingImagePublic"];
export type ListingPage = components["schemas"]["ListingPage"];
export type ListingStatusSummary = components["schemas"]["ListingStatusSummary"];

export type AdminUserPublic = components["schemas"]["AdminUserPublic"];
export type AdminUserPage = components["schemas"]["AdminUserPage"];
export type SuspendUserRequest = components["schemas"]["SuspendUserRequest"];
export type AdminPasswordResetResponse = components["schemas"]["AdminPasswordResetResponse"];
