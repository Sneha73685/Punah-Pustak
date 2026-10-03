import { useState } from "react";

import { MD_UP, useMediaQuery } from "@/hooks/useMediaQuery";

import { useAuth } from "@/auth/AuthContext";
import { adminActionClasses } from "@/components/AdminControls";

import { AdminNav } from "@/components/AdminNav";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getErrorMessage, QueryState } from "@/components/QueryState";
import {
  useAdminUsers,
  useReinstateUser,
  useResetUserPassword,
  useSuspendUser,
} from "@/hooks/useAdmin";
import type { AdminUserPublic } from "@/api/types";

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** FR-040/041/045, UC-6/UC-7: list every user with paginated status, and
 * the three admin-only mutating actions (suspend, reinstate, reset
 * password) — each behind its own confirmation modal (FE-040). */
export function AdminUsersPage(): React.JSX.Element {
  const isWide = useMediaQuery(MD_UP);
  const { state: authState } = useAuth();
  const [page, setPage] = useState(1);
  const query = useAdminUsers({ page, pageSize: PAGE_SIZE });
  const suspendMutation = useSuspendUser();
  const reinstateMutation = useReinstateUser();
  const resetPasswordMutation = useResetUserPassword();

  const [suspendTarget, setSuspendTarget] = useState<AdminUserPublic | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [resetTarget, setResetTarget] = useState<AdminUserPublic | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  // None of these three actions have a form field to attach an error to
  // (reason code is already client-validated before the button is even
  // enabled) — a plain alert is the right shape. Without this, a real
  // failure (e.g. suspending a fellow admin — the user list includes every
  // account, admins included, and `AdminUserPublic` carries no `role` to
  // even show which rows are admins — hits the backend's admin-target
  // 403; or a 409 race with another admin's session) left the modal stuck
  // open with no visible feedback and an unhandled promise rejection,
  // since `mutateAsync` rejects and none of these handlers used to catch it.
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSuspend(): Promise<void> {
    if (!suspendTarget) return;
    setActionError(null);
    try {
      await suspendMutation.mutateAsync({ userId: suspendTarget.id, reasonCode });
      setSuspendTarget(null);
      setReasonCode("");
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleReinstate(user: AdminUserPublic): Promise<void> {
    setActionError(null);
    try {
      await reinstateMutation.mutateAsync(user.id);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleResetPassword(): Promise<void> {
    if (!resetTarget) return;
    setActionError(null);
    try {
      const result = await resetPasswordMutation.mutateAsync(resetTarget.id);
      setTemporaryPassword(result.temporary_password);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function closeResetModal(): void {
    setResetTarget(null);
    setTemporaryPassword(null);
  }

  // The user list carries no `role`, so other admins can't be told apart
  // from regular users here (the API rejects actions on them with a 403,
  // surfaced in the banner below). The one admin we *can* identify is the
  // signed-in one, so their own row offers no actions.
  const currentUserId = authState.status === "authenticated" ? authState.user.id : null;

  function renderActions(user: AdminUserPublic): React.ReactNode {
    if (user.id === currentUserId) {
      return null;
    }
    return (
      <>
        {user.is_active ? (
          <button
            type="button"
            className={adminActionClasses()}
            onClick={() => {
              setActionError(null);
              setSuspendTarget(user);
            }}
          >
            Suspend
          </button>
        ) : (
          <button
            type="button"
            className={adminActionClasses()}
            disabled={reinstateMutation.isPending}
            onClick={() => void handleReinstate(user)}
          >
            Reinstate
          </button>
        )}
        <button
          type="button"
          className={adminActionClasses()}
          onClick={() => {
            setActionError(null);
            setResetTarget(user);
          }}
        >
          Reset password
        </button>
      </>
    );
  }

  function renderStatus(user: AdminUserPublic): React.JSX.Element {
    return (
      <span className="inline-flex items-center gap-2">
        <Badge tone={user.is_active ? "success" : "danger"} dot>
          {user.is_active ? "Active" : "Suspended"}
        </Badge>
        {user.id === currentUserId && <span className="text-xs font-medium text-ink-muted">You</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Manage accounts, suspensions, and password resets." />
      <AdminNav />

      {/* Reinstate has no confirmation modal to attach its own error to
          (it isn't a destructive action, FE-040), so this banner is the one
          place all three actions' errors can surface. */}
      {actionError && (
        <p role="alert" className="text-sm font-medium text-danger-600">
          {actionError}
        </p>
      )}

      <QueryState isLoading={query.isPending} error={query.error}>
        {/* A dense table from `md` up, label/value cards on phones — a
            five-column table at 375px is a sideways scroll with the actions
            off-screen. Chosen in JS so only one copy is ever in the DOM. */}
        {isWide ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-strong text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Display name</th>
                <th className="px-3 py-2 font-semibold">Created</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((user) => (
                <tr key={user.id} className="border-b border-border transition-colors hover:bg-paper-muted/60">
                  <td className="px-3 py-1.5 text-ink">{user.email}</td>
                  <td className="px-3 py-1.5 text-ink">{user.display_name}</td>
                  <td className="px-3 py-1.5 text-ink-muted lining-nums tabular-nums">{formatDate(user.created_at)}</td>
                  <td className="px-3 py-1.5">
                    {renderStatus(user)}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1">{renderActions(user)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {query.data?.items.map((user) => (
              <li key={user.id} className="py-3">
                <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink-muted">Email</dt>
                  <dd className="break-words text-ink">{user.email}</dd>
                  <dt className="text-ink-muted">Name</dt>
                  <dd className="text-ink">{user.display_name}</dd>
                  <dt className="text-ink-muted">Created</dt>
                  <dd className="text-ink">{formatDate(user.created_at)}</dd>
                  <dt className="text-ink-muted">Status</dt>
                  <dd>
                    {renderStatus(user)}
                  </dd>
                </dl>
                <div className="-ml-2 mt-1 flex flex-wrap gap-1">{renderActions(user)}</div>
              </li>
            ))}
          </ul>
        )}

        {query.data && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={setPage} />
        )}
      </QueryState>

      <Modal
        isOpen={suspendTarget !== null}
        onClose={() => setSuspendTarget(null)}
        title={`Suspend ${suspendTarget?.email ?? ""}?`}
      >
        <p className="text-sm text-ink-muted">
          They will be immediately unable to log in. This requires a reason code for the audit log
          (FR-042).
        </p>
        <div className="mt-4">
          <Input
            label="Reason code"
            required
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
          />
        </div>
        {actionError && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger-600">
            {actionError}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setSuspendTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!reasonCode.trim()}
            isLoading={suspendMutation.isPending}
            onClick={() => void handleSuspend()}
          >
            Suspend
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={resetTarget !== null}
        onClose={closeResetModal}
        title={`Reset password for ${resetTarget?.email ?? ""}?`}
      >
        {temporaryPassword ? (
          <div>
            <p className="text-sm text-ink-muted">
              Relay this temporary password to the user out-of-band. It will not be shown again
              (FR-045).
            </p>
            <p className="mt-2 rounded-lg bg-paper-muted p-2 font-mono text-sm text-ink">
              {temporaryPassword}
            </p>
            <div className="mt-4 flex justify-end">
              <Button onClick={closeResetModal}>Done</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-ink-muted">
              This generates a new temporary password and requires the user to change it on next
              login.
            </p>
            {actionError && (
              <p role="alert" className="mt-2 text-sm font-medium text-danger-600">
                {actionError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={closeResetModal}>
                Cancel
              </Button>
              <Button isLoading={resetPasswordMutation.isPending} onClick={() => void handleResetPassword()}>
                Reset password
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
