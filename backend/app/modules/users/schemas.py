"""Pydantic v2 response schemas for `User` (API-020).

Only a public-safe projection lives here — `password_hash` and
`must_change_password` (an internal flag, not yet consumed until Milestone
3's forced-password-change flow) are deliberately excluded from anything
serialized back to a client.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    created_at: datetime
