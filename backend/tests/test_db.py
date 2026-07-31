"""Unit tests for `app.core.db.get_db`'s commit/rollback control flow.

This is deliberately tested against a mocked `Session`, not a real database
connection: every test elsewhere in this suite that exercises a mutating
endpoint does so through `api_client`, which overrides `get_db` entirely
(see conftest.py) so its writes stay inside a rollback-at-teardown
transaction — meaning the REAL `get_db`'s own commit/rollback logic (added
this milestone, since Milestone 0 had no mutating endpoints to need it) is
never exercised by any other test in this suite. Driving the generator
directly here, with a mock session, tests that logic in isolation without
touching a real database at all.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.core.db import get_db


class TestGetDb:
    def test_commits_and_closes_on_successful_completion(self) -> None:
        mock_session = MagicMock()
        with patch("app.core.db.SessionLocal", return_value=mock_session):
            generator = get_db()
            yielded = next(generator)
            assert yielded is mock_session

            with pytest.raises(StopIteration):
                next(generator)

        mock_session.commit.assert_called_once()
        mock_session.rollback.assert_not_called()
        mock_session.close.assert_called_once()

    def test_rolls_back_and_reraises_on_exception(self) -> None:
        mock_session = MagicMock()
        with patch("app.core.db.SessionLocal", return_value=mock_session):
            generator = get_db()
            next(generator)

            with pytest.raises(RuntimeError, match="boom"):
                generator.throw(RuntimeError("boom"))

        mock_session.commit.assert_not_called()
        mock_session.rollback.assert_called_once()
        mock_session.close.assert_called_once()
