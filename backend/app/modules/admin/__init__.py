"""Admin module (BE-002): moderation (§7.5, UC-6/UC-7) and the append-only
audit log (§10.1 `AdminAction`).

`AdminService` (service.py) is this module's public interface — it
orchestrates `users`, `listings`, and `auth`'s own services (each of which
owns its own business rules; this module coordinates across them and owns
only the audit trail) rather than reaching into their repositories
directly. Milestone 0 established the `AdminAction` schema; Milestone 4
adds everything else in this module.
"""
