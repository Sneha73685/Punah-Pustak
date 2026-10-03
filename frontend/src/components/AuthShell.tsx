import type { ReactNode } from "react";

export interface AuthShellProps {
  children: ReactNode;
}

/**
 * The frame for login, registration and the forced password change: one
 * 400px column, left-aligned to the site grid. The page supplies its
 * heading, one factual line about what the account is for, the form and
 * the switch link. No imagery, no panel.
 */
export function AuthShell({ children }: AuthShellProps): React.JSX.Element {
  return <div className="flex w-full max-w-[400px] flex-col pt-8 sm:pt-12">{children}</div>;
}
