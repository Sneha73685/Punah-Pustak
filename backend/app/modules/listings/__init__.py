"""Listings module (BE-002): browse/search/filter, detail, My Listings,
create/edit/delete/mark-sold, and image upload (§7.1/§7.3, UC-1..5).

Depends on `auth` (`get_current_user`/`get_current_user_optional`) for
identity, `users` (`UserService`) for the seller display name shown on a
listing, and `storage` (`StorageBackend`) for image persistence — all
through each module's public interface (BE-002), never their repositories
directly.
"""
