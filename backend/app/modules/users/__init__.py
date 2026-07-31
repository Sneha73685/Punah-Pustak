"""Users module (BE-002): account, profile, and role data (§10.1 User entity).

`UserService` (service.py) is this module's public interface (BE-002) — the
`auth` module's registration/login/`get_current_user` flows call into it
rather than importing `UserRepository`/`User` directly. Milestone 3 adds
this module's own router (view/edit display name, change password); it
still exposes `create`/lookup-by-email/lookup-by-id for `auth`'s use.
"""
