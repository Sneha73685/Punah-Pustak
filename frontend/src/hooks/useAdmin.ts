import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as adminApi from "@/api/admin";
import type { PageParams } from "@/api/admin";
import type { ListingStatus } from "@/api/types";

/** FE-003: admin server-state, kept separate from `useListings.ts` since
 * these hit `/api/v1/admin/*` and operate on admin-only shapes
 * (`AdminUserPublic`, unfiltered `ListingPage`) rather than the
 * regular-user resources the other hook files wrap. */
const adminKeys = {
  users: (params: PageParams) => ["admin", "users", params] as const,
  listings: (params: PageParams & { status?: ListingStatus }) =>
    ["admin", "listings", params] as const,
};

export function useAdminUsers(params: PageParams) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => adminApi.listUsers(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useSuspendUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reasonCode }: { userId: string; reasonCode: string }) =>
      adminApi.suspendUser(userId, reasonCode),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useReinstateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => adminApi.reinstateUser(userId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (userId: string) => adminApi.resetUserPassword(userId),
  });
}

export function useAdminListings(params: PageParams & { status?: ListingStatus }) {
  return useQuery({
    queryKey: adminKeys.listings(params),
    queryFn: () => adminApi.listAdminListings(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useRemoveListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, reasonCode }: { listingId: string; reasonCode: string }) =>
      adminApi.removeListing(listingId, reasonCode),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "listings"] }),
  });
}
