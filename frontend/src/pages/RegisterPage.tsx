import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { toFormErrors } from "@/lib/formErrors";

/** SEC-011: 10+ characters, no composition rules — mirrors the backend's
 * own policy exactly (see `RegisterRequest.password`'s Field constraint)
 * so the client-side check (FE-020) never disagrees with the server. */
const MIN_PASSWORD_LENGTH = 10;

/** §8.2: registration does NOT log the user in — `AuthContext.register`
 * only calls `POST /auth/register`, so this page shows a success state and
 * a link to `/login` rather than navigating anywhere on its own. */
export function RegisterPage(): React.JSX.Element {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    // FE-020: client-side validation in addition to (never instead of)
    // server-side — the server enforces the identical rule regardless.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldErrors({ password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    setIsSubmitting(true);
    try {
      await register({ email, password, display_name: displayName });
      setIsRegistered(true);
    } catch (error) {
      const { fields, formMessage } = toFormErrors(error);
      setFieldErrors(fields);
      setFormError(formMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isRegistered) {
    return (
      <div className="mx-auto max-w-sm">
        <Card>
          <h1 className="text-xl font-semibold text-slate-900">Account created</h1>
          <p className="mt-2 text-sm text-slate-600">
            You can now{" "}
            <Link to="/login" className="font-medium text-blue-700 hover:underline">
              log in
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">Register</h1>
        <form className="mt-4 flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <Input
            label="Display name"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={fieldErrors.display_name}
          />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          {formError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {formError}
            </p>
          )}
          <Button type="submit" isLoading={isSubmitting}>
            Register
          </Button>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-blue-700 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
