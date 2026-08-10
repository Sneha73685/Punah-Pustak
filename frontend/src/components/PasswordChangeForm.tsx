import { useState, type FormEvent } from "react";

import * as usersApi from "@/api/users";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toFormErrors } from "@/lib/formErrors";

const MIN_PASSWORD_LENGTH = 10;

export interface PasswordChangeFormProps {
  /** FR-031: the same field, and the same endpoint, whether the caller is
   * proving a remembered password (self-initiated change) or the one-time
   * temporary password from an admin-assisted reset (the forced-change
   * flow, FR-015) — see the backend's `PasswordChangeRequest` docstring.
   * Only the surrounding page's copy differs; this form doesn't need to
   * know which case it's in. */
  currentPasswordLabel?: string;
  onSuccess: () => void;
}

/**
 * Shared by `ProfilePage` (self-initiated change) and `ChangePasswordPage`
 * (FR-015's forced flow) rather than duplicated — the two pages differ
 * only in surrounding copy/navigation, not in the form itself.
 */
export function PasswordChangeForm({
  currentPasswordLabel = "Current password",
  onSuccess,
}: PasswordChangeFormProps): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setFieldErrors({
        new_password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await usersApi.changeOwnPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      onSuccess();
    } catch (error) {
      const { fields, formMessage } = toFormErrors(error);
      setFieldErrors(fields);
      setFormError(formMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <Input
        label={currentPasswordLabel}
        type="password"
        autoComplete="current-password"
        required
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        error={fieldErrors.current_password}
      />
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        error={fieldErrors.new_password}
      />
      {formError && (
        <p role="alert" className="text-sm font-medium text-clay-600">
          {formError}
        </p>
      )}
      <Button type="submit" isLoading={isSubmitting}>
        Change password
      </Button>
    </form>
  );
}
