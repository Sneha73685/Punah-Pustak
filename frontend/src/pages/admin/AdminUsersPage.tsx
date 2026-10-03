import { useState } from "react";

import { LG_UP, useMediaQuery } from "@/hooks/useMediaQuery";

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
import { formatDay } from "@/lib/listingLabels";
import type { AdminUserPublic } from "@/api/types";

const PAGE_SIZE = 20;


/** FR-040/041/045, UC-6/UC-7: list every user with paginated status, and
 * the three admin-only mutating actions (suspend, reinstate, reset
 * password) — each behind its own confirmation modal (FE-040). */
export function AdminUsersPage(): React.JSX.Element {
  const isWide = useMediaQuery(LG_UP);
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
        {user.id === currentUserId && <span className="font-mono text-13 text-ink-2">you</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Moderation" description="Accounts, suspensions and password resets. Each action is written to the audit log." />
      <AdminNav />

      {/* Reinstate has no confirmation modal to attach its own error to
          (it isn't a destructive action, FE-040), so this banner is the one
          place all three actions' errors can surface. */}
      {actionError && (
        <p role="alert" className="border-y border-danger py-2.5 text-15 font-medium text-danger">
          {actionError}
        </p>
      )}

      <QueryState isLoading={query.isPending} error={query.error}>
        {/* A dense table from `lg` up, stacked records below it: a
            five-column table at 375px is a sideways scroll with the actions
            off-screen. Chosen in JS so only one copy is ever in the DOM. */}
        {isWide ? (
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="text-13 font-bold text-ink">
                {["Display name", "Email", "Joined", "Status", "ID", "Actions"].map((label) => (
                  <th
                    key={label}
                    className={`sticky top-0 z-10 border-b border-ink bg-ground py-2 pr-3 font-bold ${label === "Actions" ? "text-right" : ""}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((user) => (
                <tr key={user.id} className="border-b border-rule">
                  <td className="py-1.5 pr-3 font-semibold text-ink">{user.display_name}</td>
                  <td className="py-1.5 pr-3 text-ink">{user.email}</td>
                  <td className="tnum whitespace-nowrap py-1.5 pr-3 font-mono text-13 text-ink-2">{formatDay(user.created_at)}</td>
                  <td className="py-1.5 pr-3">{renderStatus(user)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-13 text-ink-2">{user.id.slice(0, 8)}</td>
                  <td className="py-1.5">
                    <div className="flex justify-end gap-4 whitespace-nowrap">{renderActions(user)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="border-t border-ink">
            {query.data?.items.map((user) => (
              <li key={user.id} className="border-b border-rule py-3">
                <p className="font-semibold text-ink">{user.display_name}</p>
                <dl className="mt-1 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[14px]">
                  <dt className="text-ink-2">Email</dt>
                  <dd className="break-words text-ink">{user.email}</dd>
                  <dt className="text-ink-2">Joined</dt>
                  <dd className="tnum font-mono text-13 text-ink-2">{formatDay(user.created_at)}</dd>
                  <dt className="text-ink-2">Status</dt>
                  <dd>{renderStatus(user)}</dd>
                </dl>
                <div className="-ml-1 mt-1 flex flex-wrap gap-x-4">{renderActions(user)}</div>
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
        <p className="text-15 text-ink-2">
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
          <p role="alert" className="mt-2 text-15 font-medium text-danger">
            {actionError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
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
            <p className="text-15 text-ink-2">
              Relay this temporary password to the user out-of-band. It will not be shown again
              (FR-045).
            </p>
            <p className="mt-3 border border-dashed border-rule-strong bg-white px-3 py-2.5 font-mono text-17 text-ink">
              {temporaryPassword}
            </p>
            <div className="mt-5 flex justify-end">
              <Button onClick={closeResetModal}>Done</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-15 text-ink-2">
              This generates a new temporary password and requires the user to change it on next
              login.
            </p>
            {actionError && (
              <p role="alert" className="mt-2 text-15 font-medium text-danger">
                {actionError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
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
