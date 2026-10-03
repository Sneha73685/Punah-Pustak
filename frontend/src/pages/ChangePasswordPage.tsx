import { useAuth } from "@/auth/AuthContext";
import { AuthShell } from "@/components/AuthShell";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";

/**
 * FE-015/FE-022: reached while `AuthContext`'s state is
 * `"password-change-required"` — that context's own `passwordChangeRequiredHandler`
 * (registered on mount, fired by `src/api/client.ts` on *any* 403
 * `PASSWORD_CHANGE_REQUIRED`, not only at login) navigates here directly,
 * and `ProtectedRoute` redirects here too for any route it guards. This
 * page itself has no route guard of its own beyond that: if a normally
 * -authenticated user somehow lands here directly, `completePasswordChange`
 * below simply re-syncs to whatever the backend says is true (it always
 * re-fetches, never assumes).
 */
export function ChangePasswordPage(): React.JSX.Element {
  const { completePasswordChange } = useAuth();

  return (
    <AuthShell>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-30">
        Change your password
      </h1>
      <p className="mt-2 text-17 text-ink-2">
        An administrator reset your password. Enter the temporary password you were given, then choose a new one,
        before continuing.
      </p>
      <div className="mt-7">
        <PasswordChangeForm currentPasswordLabel="Temporary password" onSuccess={() => void completePasswordChange()} />
      </div>
    </AuthShell>
  );
}
