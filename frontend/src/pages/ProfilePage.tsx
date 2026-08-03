import { useState, type FormEvent } from "react";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { QueryState } from "@/components/QueryState";
import { useMyListingsSummary } from "@/hooks/useListings";
import { useUpdateOwnProfile } from "@/hooks/useProfile";
import { toFormErrors } from "@/lib/formErrors";

/** FR-030..033: display name (editable), email (read-only — FR-033), a
 * listing-status-count summary (FR-032), and a password-change form
 * (FR-031, sharing `PasswordChangeForm` with the forced-change flow). */
export function ProfilePage(): React.JSX.Element | null {
  const { state, refreshUser } = useAuth();
  const summaryQuery = useMyListingsSummary();
  const updateMutation = useUpdateOwnProfile();
  const [displayName, setDisplayName] = useState(
    state.status === "authenticated" ? state.user.display_name : "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  if (state.status !== "authenticated") {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSaved(false);
    try {
      await updateMutation.mutateAsync({ display_name: displayName });
      await refreshUser();
      setSaved(true);
    } catch (error) {
      const { fields, formMessage } = toFormErrors(error);
      setFieldErrors(fields);
      setFormError(formMessage);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Account details</h2>
        <form className="mt-4 flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <Input label="Email" value={state.user.email} disabled hint="Email cannot be changed." />
          <Input
            label="Display name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={fieldErrors.display_name}
          />
          {formError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {formError}
            </p>
          )}
          {saved && <p className="text-sm font-medium text-green-700">Saved.</p>}
          <Button type="submit" isLoading={updateMutation.isPending}>
            Save changes
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Your listings</h2>
        <div className="mt-4">
          <QueryState isLoading={summaryQuery.isPending} error={summaryQuery.error}>
            {summaryQuery.data && (
              <dl className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <dt className="text-sm text-slate-500">Available</dt>
                  <dd className="text-xl font-semibold text-slate-900">
                    {summaryQuery.data.available}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Sold</dt>
                  <dd className="text-xl font-semibold text-slate-900">{summaryQuery.data.sold}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Deleted</dt>
                  <dd className="text-xl font-semibold text-slate-900">
                    {summaryQuery.data.deleted}
                  </dd>
                </div>
              </dl>
            )}
          </QueryState>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
        <div className="mt-4">
          {passwordChanged ? (
            <p className="text-sm font-medium text-green-700">Password changed.</p>
          ) : (
            <PasswordChangeForm onSuccess={() => setPasswordChanged(true)} />
          )}
        </div>
      </Card>
    </div>
  );
}
