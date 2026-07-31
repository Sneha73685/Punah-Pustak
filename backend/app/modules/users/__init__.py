"""Users module (BE-002): account, profile, and role data (§10.1 User entity).

`UserService` (service.py) is this module's public interface (BE-002) — the
`auth` module's registration/login flows call into it rather than importing
`UserRepository`/`User` directly. Profile-editing endpoints (view/edit
display name, change password) are Milestone 3 work; this module currently
exposes only what `auth` needs (create, lookup by email/id).
"""
