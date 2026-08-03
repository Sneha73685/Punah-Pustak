import { useState } from "react";

import { AdminNav } from "@/components/AdminNav";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
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

/** FR-040/041/045, UC-6/UC-7: list every user with paginated status, and
 * the three admin-only mutating actions (suspend, reinstate, reset
 * password) — each behind its own confirmation modal (FE-040). */
export function AdminUsersPage(): React.JSX.Element {
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
      <AdminNav />

      {/* Reinstate has no confirmation modal to attach its own error to
          (it isn't a destructive action, FE-040), so this banner is the one
          place all three actions' errors can surface. */}
      {actionError && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {actionError}
        </p>
      )}

      <QueryState isLoading={query.isPending} error={query.error}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Display name</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((user) => (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{user.email}</td>
                  <td className="py-2 pr-4">{user.display_name}</td>
                  <td className="py-2 pr-4">{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={user.is_active ? "success" : "danger"}>
                      {user.is_active ? "Active" : "Suspended"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-2">
                      {user.is_active ? (
                        <Button
                          variant="danger"
                          onClick={() => {
                            setActionError(null);
                            setSuspendTarget(user);
                          }}
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          isLoading={reinstateMutation.isPending}
                          onClick={() => void handleReinstate(user)}
                        >
                          Reinstate
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActionError(null);
                          setResetTarget(user);
                        }}
                      >
                        Reset password
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {query.data && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={setPage} />
        )}
      </QueryState>

      <Modal
        isOpen={suspendTarget !== null}
        onClose={() => setSuspendTarget(null)}
        title={`Suspend ${suspendTarget?.email ?? ""}?`}
      >
        <p className="text-sm text-slate-600">
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
          <p role="alert" className="mt-2 text-sm font-medium text-red-700">
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
            <p className="text-sm text-slate-600">
              Relay this temporary password to the user out-of-band. It will not be shown again
              (FR-045).
            </p>
            <p className="mt-2 rounded-md bg-slate-100 p-2 font-mono text-sm text-slate-900">
              {temporaryPassword}
            </p>
            <div className="mt-4 flex justify-end">
              <Button onClick={closeResetModal}>Done</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-600">
              This generates a new temporary password and requires the user to change it on next
              login.
            </p>
            {actionError && (
              <p role="alert" className="mt-2 text-sm font-medium text-red-700">
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
