"""Modular monolith module boundary (BE-002).

Modules: auth, users, listings, admin, storage. Each module owns its own
routers/services/repositories/models. Cross-module calls MUST go through a
module's service interface, never by reaching directly into another
module's repository or ORM models.

Milestone 0 populated only the `models.py` of each module (the schema).
Milestone 1 added `auth`'s and `users`' routers/services/repositories.
Milestone 2 adds `listings`' full stack and `storage`'s abstraction (it has
no model of its own — nothing to persist to Postgres, only to object
storage). `admin` still holds only its model until its own milestone.
"""
