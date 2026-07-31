"""Modular monolith module boundary (BE-002).

Modules: auth, users, listings, admin, storage. Each module owns its own
routers/services/repositories/models. Cross-module calls MUST go through a
module's service interface, never by reaching directly into another
module's repository or ORM models.

Milestone 0 populated only the `models.py` of each module (the schema).
Milestone 1 adds `auth`'s and `users`' routers/services/repositories;
`listings`, `admin`, and `storage` still hold only their models until their
own milestones.
"""
