import { useAuth } from "@/auth/AuthContext";
import { Card } from "@/components/Card";
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
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">Change your password</h1>
        <p className="mt-2 text-sm text-slate-600">
          An administrator reset your password. Enter the temporary password you were given, then
          choose a new one, before continuing.
        </p>
        <div className="mt-4">
          <PasswordChangeForm
            currentPasswordLabel="Temporary password"
            onSuccess={() => void completePasswordChange()}
          />
        </div>
      </Card>
    </div>
  );
}
