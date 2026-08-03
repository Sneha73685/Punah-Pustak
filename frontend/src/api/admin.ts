import { apiFetch } from "@/api/client";
import type {
  AdminPasswordResetResponse,
  AdminUserPage,
  AdminUserPublic,
  ListingPage,
  ListingStatus,
} from "@/api/types";

export interface PageParams {
  page?: number;
  pageSize?: number;
}

/** FR-040. */
export function listUsers(params: PageParams = {}): Promise<AdminUserPage> {
  return apiFetch<AdminUserPage>("/api/v1/admin/users", {
    query: { page: params.page, page_size: params.pageSize },
  });
}

/** FR-041/UC-6. */
export function suspendUser(userId: string, reasonCode: string): Promise<AdminUserPublic> {
  return apiFetch<AdminUserPublic>(`/api/v1/admin/users/${userId}/suspend`, {
    method: "POST",
    json: { reason_code: reasonCode },
  });
}

/** FR-041/UC-6. */
export function reinstateUser(userId: string): Promise<AdminUserPublic> {
  return apiFetch<AdminUserPublic>(`/api/v1/admin/users/${userId}/reinstate`, { method: "POST" });
}

/** FR-045/UC-7 — the returned temporary password is shown exactly once. */
export function resetUserPassword(userId: string): Promise<AdminPasswordResetResponse> {
  return apiFetch<AdminPasswordResetResponse>(`/api/v1/admin/users/${userId}/reset-password`, {
    method: "POST",
  });
}

/** FR-043: any status, unlike public browse. */
export function listAdminListings(
  params: PageParams & { status?: ListingStatus } = {},
): Promise<ListingPage> {
  return apiFetch<ListingPage>("/api/v1/admin/listings", {
    query: { status: params.status, page: params.page, page_size: params.pageSize },
  });
}

/** FR-042/FR-029 — `reasonCode` is a query parameter, not a body (see the
 * backend's `SuspendUserRequest` docstring for why `DELETE` bodies were
 * avoided). */
export function removeListing(listingId: string, reasonCode: string): Promise<void> {
  return apiFetch<void>(`/api/v1/admin/listings/${listingId}`, {
    method: "DELETE",
    query: { reason_code: reasonCode },
  });
}
