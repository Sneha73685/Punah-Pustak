import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as listingsApi from "@/api/listings";
import type { BrowseFilters } from "@/api/listings";
import type { ListingCreate, ListingUpdate } from "@/api/types";
import * as usersApi from "@/api/users";

/**
 * FE-003: every server-state read/write in this app goes through TanStack
 * Query via a hook in this file (or the sibling `useAdmin`/`useProfile`
 * ones) — no component calls `src/api/*` functions directly, and no
 * server data is duplicated into a global client store.
 */
const listingKeys = {
  browse: (filters: BrowseFilters) => ["listings", "browse", filters] as const,
  detail: (id: string) => ["listings", "detail", id] as const,
  mine: () => ["listings", "mine"] as const,
  mySummary: () => ["listings", "mine", "summary"] as const,
};

export function useBrowseListings(filters: BrowseFilters) {
  return useQuery({
    queryKey: listingKeys.browse(filters),
    queryFn: () => listingsApi.browseListings(filters),
    placeholderData: (previousData) => previousData, // keep the old page visible while the next loads
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: listingKeys.detail(id),
    queryFn: () => listingsApi.getListing(id),
  });
}

export function useMyListings() {
  return useQuery({
    queryKey: listingKeys.mine(),
    queryFn: () => listingsApi.getMyListings(),
  });
}

export function useMyListingsSummary() {
  return useQuery({
    // `getOwnListingsSummary` lives in `src/api/users.ts`, matching the
    // backend's own `GET /users/me/listings/summary` URL — even though,
    // same as the backend, this hook's *cache key* groups it under
    // "listings" (the resource it's actually about), not "users".
    queryKey: listingKeys.mySummary(),
    queryFn: () => usersApi.getOwnListingsSummary(),
  });
}

function invalidateListingLists(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ["listings", "browse"] });
  void queryClient.invalidateQueries({ queryKey: listingKeys.mine() });
  void queryClient.invalidateQueries({ queryKey: listingKeys.mySummary() });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ListingCreate) => listingsApi.createListing(body),
    onSuccess: () => invalidateListingLists(queryClient),
  });
}

export function useUpdateListing(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ListingUpdate) => listingsApi.updateListing(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listingKeys.detail(id) });
      invalidateListingLists(queryClient);
    },
  });
}

export function useDeleteListing(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => listingsApi.deleteListing(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listingKeys.detail(id) });
      invalidateListingLists(queryClient);
    },
  });
}

export function useMarkListingSold(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => listingsApi.markListingSold(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listingKeys.detail(id) });
      invalidateListingLists(queryClient);
    },
  });
}

/**
 * `id` is a call-time argument (mirroring `useSuspendUser`/`useRemoveListing`
 * in `useAdmin.ts`), not a hook parameter fixed at render time: on
 * `CreateListingPage`, the listing's id doesn't exist until the create
 * mutation resolves, moments before this one fires in the same handler —
 * a hook parameter would close over the id's value *at the last render*,
 * which is still empty at that point.
 */
export function useUploadListingImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) =>
      listingsApi.uploadListingImages(id, files),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: listingKeys.detail(variables.id) });
    },
  });
}
