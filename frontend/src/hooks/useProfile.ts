import { useMutation } from "@tanstack/react-query";

import * as usersApi from "@/api/users";
import type { UserUpdate } from "@/api/types";

/** FR-030. The current user lives in `AuthContext`'s own state (not
 * TanStack Query), so the caller is responsible for calling `refreshUser()`
 * on success — see `ProfilePage`. */
export function useUpdateOwnProfile() {
  return useMutation({
    mutationFn: (body: UserUpdate) => usersApi.updateOwnProfile(body),
  });
}
