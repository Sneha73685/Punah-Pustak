import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { toFormErrors } from "@/lib/formErrors";

interface LocationState {
  from?: Location;
}

/**
 * FE-022: this form's whole job, beyond the obvious login submission, is
 * to do *nothing else* — it never navigates on a successful `login()` call
 * itself. Whether that call results in "authenticated" (this page's own
 * effect below sends the user on) or "password-change-required" (the
 * global handler in `AuthContext`, registered once for every endpoint, has
 * already redirected to `/change-password` by the time `login()`
 * resolves) is decided by state this component reacts to, not a value
 * `login()` hands back — reading `state` synchronously right after the
 * `await` would risk a stale closure if this component hadn't re-rendered
 * with the update yet.
 */
export function LoginPage(): React.JSX.Element {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (state.status === "authenticated") {
      const from = (location.state as LocationState | null)?.from?.pathname ?? "/";
      navigate(from, { replace: true });
    }
  }, [state.status, location.state, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
    } catch (error) {
      const { fields, formMessage } = toFormErrors(error);
      setFieldErrors(fields);
      setFormError(formMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">Log in</h1>
        <form className="mt-4 flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
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
            autoComplete="current-password"
            required
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
            Log in
          </Button>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-medium text-blue-700 hover:underline">
            Register
          </Link>
        </p>
      </Card>
    </div>
  );
}
