"""Tests for the current-user token usage dashboard API."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.routers import token_usage


def _make_app(run_store: MagicMock) -> FastAPI:
    app = FastAPI()
    app.include_router(token_usage.router)
    app.state.run_store = run_store
    return app


def test_token_usage_dashboard_returns_daily_stacked_series(monkeypatch):
    async def _current_user(_request):
        return "user-a"

    monkeypatch.setattr(token_usage, "get_current_user", _current_user)

    today = datetime.now(UTC).date()
    yesterday = today - timedelta(days=1)
    run_store = MagicMock()
    run_store.aggregate_daily_tokens_by_user = AsyncMock(
        return_value=[
            {
                "date": today.isoformat(),
                "model": "gpt-4o",
                "runs": 2,
                "total_tokens": 120,
                "total_input_tokens": 70,
                "total_output_tokens": 50,
            },
            {
                "date": today.isoformat(),
                "model": "claude-sonnet",
                "runs": 1,
                "total_tokens": 80,
                "total_input_tokens": 55,
                "total_output_tokens": 25,
            },
            {
                "date": yesterday.isoformat(),
                "model": "gpt-4o",
                "runs": 1,
                "total_tokens": 30,
                "total_input_tokens": 20,
                "total_output_tokens": 10,
            },
        ],
    )
    app = _make_app(run_store)

    with TestClient(app) as client:
        response = client.get("/api/token-usage/dashboard?days=7")

    assert response.status_code == 200
    body = response.json()
    assert body["days"] == 7
    assert body["total_tokens"] == 230
    assert body["total_input_tokens"] == 145
    assert body["total_output_tokens"] == 85
    assert body["models"] == ["claude-sonnet", "gpt-4o"]
    assert len(body["buckets"]) == 7

    today_bucket = next(bucket for bucket in body["buckets"] if bucket["date"] == today.isoformat())
    assert today_bucket["total_tokens"] == 200
    assert today_bucket["models"]["gpt-4o"] == {
        "tokens": 120,
        "input_tokens": 70,
        "output_tokens": 50,
        "runs": 2,
    }
    assert today_bucket["models"]["claude-sonnet"]["tokens"] == 80

    run_store.aggregate_daily_tokens_by_user.assert_awaited_once_with("user-a", days=7)


def test_token_usage_dashboard_rejects_unsupported_range(monkeypatch):
    async def _current_user(_request):
        return "user-a"

    monkeypatch.setattr(token_usage, "get_current_user", _current_user)
    run_store = MagicMock()
    run_store.aggregate_daily_tokens_by_user = AsyncMock()
    app = _make_app(run_store)

    with TestClient(app) as client:
        response = client.get("/api/token-usage/dashboard?days=14")

    assert response.status_code == 400
    assert response.json()["detail"] == "days must be 7 or 30"
    run_store.aggregate_daily_tokens_by_user.assert_not_called()
