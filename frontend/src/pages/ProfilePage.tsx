import { useState, type FormEvent } from "react";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { QueryState } from "@/components/QueryState";
import { StatStrip } from "@/components/StatStrip";
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

  const initial = state.user.display_name.trim().charAt(0).toUpperCase() || "?";

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
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="animate-fade-up flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-moss-500 font-serif text-2xl font-semibold text-white shadow-card ring-4 ring-white">
          {initial}
        </span>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {state.user.display_name}
          </h1>
          <p className="text-sm text-ink-muted">{state.user.email}</p>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border border-t border-border">
        <section className="animate-fade-up flex flex-col gap-4 py-8">
          <h2 className="font-serif text-lg font-semibold text-ink">Account details</h2>
          <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
            <Input label="Email" value={state.user.email} disabled hint="Email cannot be changed." />
            <Input
              label="Display name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              error={fieldErrors.display_name}
            />
            {formError && (
              <p role="alert" className="text-sm font-medium text-clay-600">
                {formError}
              </p>
            )}
            {saved && <p className="text-sm font-medium text-moss-600">Saved.</p>}
            <Button type="submit" isLoading={updateMutation.isPending} className="self-start">
              Save changes
            </Button>
          </form>
        </section>

        <section className="animate-fade-up flex flex-col gap-4 py-8" style={{ animationDelay: "60ms" }}>
          <h2 className="font-serif text-lg font-semibold text-ink">Your listings</h2>
          <QueryState isLoading={summaryQuery.isPending} error={summaryQuery.error}>
            {summaryQuery.data && (
              <StatStrip
                items={[
                  { label: "Available", value: summaryQuery.data.available, tone: "accent" },
                  { label: "Sold", value: summaryQuery.data.sold },
                  { label: "Deleted", value: summaryQuery.data.deleted, tone: "muted" },
                ]}
              />
            )}
          </QueryState>
        </section>

        <section className="animate-fade-up flex flex-col gap-4 py-8" style={{ animationDelay: "120ms" }}>
          <h2 className="font-serif text-lg font-semibold text-ink">Change password</h2>
          {passwordChanged ? (
            <p className="text-sm font-medium text-moss-600">Password changed.</p>
          ) : (
            <PasswordChangeForm onSuccess={() => setPasswordChanged(true)} />
          )}
        </section>
      </div>
    </div>
  );
}
