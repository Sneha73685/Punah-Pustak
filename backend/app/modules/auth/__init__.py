"""Auth module (BE-002): registration, login, refresh, logout.

Owns the `RefreshToken` entity (§10.1) and the full token lifecycle
(SEC-020..025). `get_current_user` (dependencies.py) is this module's public
interface for every other module that needs to know who is making a
request — Milestone 2+ routers depend on it directly rather than
re-implementing token verification.
"""
