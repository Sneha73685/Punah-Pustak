import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { PageHeader } from "@/components/PageHeader";
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
    <div className="flex max-w-3xl flex-col">
      <PageHeader title={state.user.display_name} description={state.user.email} />

      <div className="mt-6 flex flex-col">
        <ProfileSection title="Account">
          <form className="flex max-w-[400px] flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
            <Input label="Email" value={state.user.email} disabled hint="Email can't be changed." />
            <Input
              label="Display name"
              required
              hint="Shown to buyers on every copy you list."
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              error={fieldErrors.display_name}
            />
            {formError && (
              <p role="alert" className="text-15 font-medium text-danger">
                {formError}
              </p>
            )}
            {saved && (
              <p role="status" className="text-15 font-medium text-ink">
                Saved.
              </p>
            )}
            <Button type="submit" isLoading={updateMutation.isPending} className="self-start">
              Save changes
            </Button>
          </form>
        </ProfileSection>

        <ProfileSection title="Your copies">
          <QueryState isLoading={summaryQuery.isPending} error={summaryQuery.error}>
            {summaryQuery.data && (
              <div>
                <dl className="flex flex-wrap gap-x-10 gap-y-3">
                  {[
                    ["on offer", summaryQuery.data.available],
                    ["sold", summaryQuery.data.sold],
                    ["removed", summaryQuery.data.deleted],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-col-reverse">
                      <dt className="font-mono text-13 text-ink-2">{label}</dt>
                      <dd className="tnum text-30 font-bold tracking-[-0.02em] text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
                <Link
                  to="/my-listings"
                  className="mt-4 inline-flex min-h-11 items-center text-15 font-medium text-ballpoint underline underline-offset-4"
                >
                  Manage listings
                </Link>
              </div>
            )}
          </QueryState>
        </ProfileSection>

        <ProfileSection title="Password">
          {passwordChanged ? (
            <p role="status" className="text-15 font-medium text-ink">
              Password changed.
            </p>
          ) : (
            <div className="max-w-[400px]">
              <PasswordChangeForm onSuccess={() => setPasswordChanged(true)} />
            </div>
          )}
        </ProfileSection>
      </div>
    </div>
  );
}

/** One ruled section: its name in a narrow left column, its content beside
 * it (stacked on phones). */
function ProfileSection({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="grid grid-cols-1 gap-3 border-t border-ink pb-10 pt-4 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6">
      <h2 className="text-17 font-bold text-ink">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
