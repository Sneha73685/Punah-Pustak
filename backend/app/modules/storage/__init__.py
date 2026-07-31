"""Storage module: object-storage abstraction (BE-030).

Deliberately empty in Milestone 0. The `StorageBackend` interface
(`.put`, `.get_url`, `.delete`) and its S3-compatible implementation are
Milestone 2 work, driven by the listing-image upload requirements
(API-030/031/032). Creating this module directory now (rather than in
Milestone 2) only reflects the fixed five-module boundary BE-002 defines
for the whole project — no interface code is added ahead of the milestone
that needs it.
"""
