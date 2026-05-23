"""Tests for the POST /api/v1/auth/initialize endpoint.

Covers: first-boot admin creation, rejection when system already
initialized, password strength validation,
and public accessibility (no auth cookie required).
"""

import asyncio
import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("AUTH_JWT_SECRET", "test-secret-key-initialize-admin-min-32")

from app.gateway.auth.config import AuthConfig, set_auth_config

_TEST_SECRET = "test-secret-key-initialize-admin-min-32"


@pytest.fixture(autouse=True)
def _setup_auth(tmp_path):
    """Fresh SQLite engine + auth config per test."""
    from app.gateway import deps
    from app.gateway.routers.auth import _SETUP_STATUS_CACHE, _SETUP_STATUS_INFLIGHT
    from deerflow.persistence.engine import close_engine, init_engine

    set_auth_config(AuthConfig(jwt_secret=_TEST_SECRET))
    url = f"sqlite+aiosqlite:///{tmp_path}/init_admin.db"
    asyncio.run(init_engine("sqlite", url=url, sqlite_dir=str(tmp_path)))
    deps._cached_local_provider = None
    deps._cached_repo = None
    _SETUP_STATUS_CACHE.clear()
    _SETUP_STATUS_INFLIGHT.clear()
    try:
        yield
    finally:
        deps._cached_local_provider = None
        deps._cached_repo = None
        _SETUP_STATUS_CACHE.clear()
        _SETUP_STATUS_INFLIGHT.clear()
        asyncio.run(close_engine())


@pytest.fixture()
def client(_setup_auth):
    from app.gateway.app import create_app
    from app.gateway.auth.config import AuthConfig, set_auth_config

    set_auth_config(AuthConfig(jwt_secret=_TEST_SECRET))
    app = create_app()
    # Do NOT use TestClient as a context manager — that would trigger the
    # full lifespan which requires config.yaml. The auth endpoints work
    # without the lifespan (persistence engine is set up by _setup_auth).
    yield TestClient(app)


def _init_payload(**extra):
    """Build a valid /initialize payload."""
    return {
        "email": "admin@example.com",
        "password": "Str0ng!Pass99",
        **extra,
    }


def _csrf_headers(client):
    token = client.cookies.get("csrf_token")
    assert token, "auth endpoint should set csrf_token cookie"
    return {"X-CSRF-Token": token}


# ── Happy path ────────────────────────────────────────────────────────────


def test_initialize_creates_admin_and_sets_cookie(client):
    """POST /initialize when no admin exists → 201, session cookie set."""
    resp = client.post("/api/v1/auth/initialize", json=_init_payload())
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "admin@example.com"
    assert data["system_role"] == "admin"
    assert "access_token" in resp.cookies


def test_initialize_needs_setup_false(client):
    """Newly created admin via /initialize has needs_setup=False."""
    client.post("/api/v1/auth/initialize", json=_init_payload())
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["needs_setup"] is False


def test_admin_can_list_users_with_admin_first(client):
    """/auth/users lists all users for admins and orders admins first."""
    regular = client.post(
        "/api/v1/auth/register",
        json={"email": "regular@example.com", "password": "Tr0ub4dor3a"},
    )
    assert regular.status_code == 201

    admin = client.post("/api/v1/auth/initialize", json=_init_payload())
    assert admin.status_code == 201

    resp = client.get("/api/v1/auth/users")
    assert resp.status_code == 200
    users = resp.json()["users"]
    assert [user["email"] for user in users] == [
        "admin@example.com",
        "regular@example.com",
    ]
    assert users[0]["system_role"] == "admin"
    assert users[1]["system_role"] == "user"
    assert users[1]["is_disabled"] is False


def test_regular_user_cannot_list_users(client):
    """/auth/users rejects non-admin users."""
    regular = client.post(
        "/api/v1/auth/register",
        json={"email": "regular@example.com", "password": "Tr0ub4dor3a"},
    )
    assert regular.status_code == 201

    resp = client.get("/api/v1/auth/users")
    assert resp.status_code == 403


def test_admin_can_create_user(client):
    """/auth/users lets admins create regular user accounts."""
    admin = client.post("/api/v1/auth/initialize", json=_init_payload())
    assert admin.status_code == 201

    created = client.post(
        "/api/v1/auth/users",
        json={"email": "created@example.com", "password": "Str0ng!Pass99"},
        headers=_csrf_headers(client),
    )
    assert created.status_code == 201
    data = created.json()
    assert data["email"] == "created@example.com"
    assert data["system_role"] == "user"

    users = client.get("/api/v1/auth/users").json()["users"]
    assert [user["email"] for user in users] == [
        "admin@example.com",
        "created@example.com",
    ]


def test_admin_create_user_rejects_duplicate_email(client):
    """/auth/users returns structured duplicate-email errors."""
    admin = client.post("/api/v1/auth/initialize", json=_init_payload())
    assert admin.status_code == 201

    first = client.post(
        "/api/v1/auth/users",
        json={"email": "duplicate@example.com", "password": "Str0ng!Pass99"},
        headers=_csrf_headers(client),
    )
    assert first.status_code == 201

    duplicate = client.post(
        "/api/v1/auth/users",
        json={"email": "duplicate@example.com", "password": "AnotherStr0ng99"},
        headers=_csrf_headers(client),
    )
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"]["code"] == "email_already_exists"


def test_regular_user_cannot_create_user(client):
    """/auth/users rejects create requests from non-admin users."""
    regular = client.post(
        "/api/v1/auth/register",
        json={"email": "regular@example.com", "password": "Tr0ub4dor3a"},
    )
    assert regular.status_code == 201

    resp = client.post(
        "/api/v1/auth/users",
        json={"email": "created@example.com", "password": "Str0ng!Pass99"},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 403


def test_admin_can_disable_and_enable_user(client):
    """Admins can disable accounts without deleting account data, then re-enable them."""
    from fastapi.testclient import TestClient

    admin = client.post("/api/v1/auth/initialize", json=_init_payload())
    assert admin.status_code == 201

    created = client.post(
        "/api/v1/auth/users",
        json={"email": "toggle@example.com", "password": "Str0ng!Pass99"},
        headers=_csrf_headers(client),
    )
    assert created.status_code == 201
    user_id = created.json()["id"]

    regular_client = TestClient(client.app)
    login = regular_client.post(
        "/api/v1/auth/login/local",
        data={"username": "toggle@example.com", "password": "Str0ng!Pass99"},
    )
    assert login.status_code == 200
    assert regular_client.get("/api/v1/auth/me").status_code == 200

    disabled = client.patch(
        f"/api/v1/auth/users/{user_id}",
        json={"is_disabled": True},
        headers=_csrf_headers(client),
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_disabled"] is True

    users = client.get("/api/v1/auth/users").json()["users"]
    disabled_user = next(user for user in users if user["id"] == user_id)
    assert disabled_user["email"] == "toggle@example.com"
    assert disabled_user["is_disabled"] is True

    me_after_disable = regular_client.get("/api/v1/auth/me")
    assert me_after_disable.status_code == 401
    assert me_after_disable.json()["detail"]["code"] == "account_disabled"

    login_after_disable = regular_client.post(
        "/api/v1/auth/login/local",
        data={"username": "toggle@example.com", "password": "Str0ng!Pass99"},
    )
    assert login_after_disable.status_code == 403
    assert login_after_disable.json()["detail"] == {
        "code": "account_disabled",
        "message": "您的账号已被禁用",
    }

    enabled = client.patch(
        f"/api/v1/auth/users/{user_id}",
        json={"is_disabled": False},
        headers=_csrf_headers(client),
    )
    assert enabled.status_code == 200
    assert enabled.json()["is_disabled"] is False

    login_after_enable = regular_client.post(
        "/api/v1/auth/login/local",
        data={"username": "toggle@example.com", "password": "Str0ng!Pass99"},
    )
    assert login_after_enable.status_code == 200


def test_regular_user_cannot_update_user_status(client):
    """/auth/users/{id} rejects enable/disable requests from non-admin users."""
    regular = client.post(
        "/api/v1/auth/register",
        json={"email": "regular@example.com", "password": "Tr0ub4dor3a"},
    )
    assert regular.status_code == 201
    user_id = regular.json()["id"]

    resp = client.patch(
        f"/api/v1/auth/users/{user_id}",
        json={"is_disabled": True},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 403


def test_admin_cannot_disable_self(client):
    """Admins cannot disable their own account and lock themselves out."""
    admin = client.post("/api/v1/auth/initialize", json=_init_payload())
    assert admin.status_code == 201
    admin_id = admin.json()["id"]

    resp = client.patch(
        f"/api/v1/auth/users/{admin_id}",
        json={"is_disabled": True},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 400


# ── Rejection when already initialized ───────────────────────────────────


def test_initialize_rejected_when_admin_exists(client):
    """Second call to /initialize after admin exists → 409 system_already_initialized."""
    client.post("/api/v1/auth/initialize", json=_init_payload())
    resp2 = client.post(
        "/api/v1/auth/initialize",
        json={**_init_payload(), "email": "other@example.com"},
    )
    assert resp2.status_code == 409
    body = resp2.json()
    assert body["detail"]["code"] == "system_already_initialized"


def test_initialize_register_does_not_block_initialization(client):
    """/register creating a user before /initialize doesn't block admin creation."""
    # Register a regular user first
    client.post("/api/v1/auth/register", json={"email": "regular@example.com", "password": "Tr0ub4dor3a"})
    # /initialize should still succeed (checks admin_count, not total user_count)
    resp = client.post("/api/v1/auth/initialize", json=_init_payload())
    assert resp.status_code == 201
    assert resp.json()["system_role"] == "admin"


# ── Endpoint is public (no cookie required) ───────────────────────────────


def test_initialize_accessible_without_cookie(client):
    """No access_token cookie needed for /initialize."""
    resp = client.post(
        "/api/v1/auth/initialize",
        json=_init_payload(),
        cookies={},
    )
    assert resp.status_code == 201


# ── Password validation ───────────────────────────────────────────────────


def test_initialize_rejects_short_password(client):
    """Password shorter than 8 chars → 422."""
    resp = client.post(
        "/api/v1/auth/initialize",
        json={**_init_payload(), "password": "short"},
    )
    assert resp.status_code == 422


def test_initialize_rejects_common_password(client):
    """Common password → 422."""
    resp = client.post(
        "/api/v1/auth/initialize",
        json={**_init_payload(), "password": "password123"},
    )
    assert resp.status_code == 422


# ── setup-status reflects initialization ─────────────────────────────────


def test_setup_status_before_initialization(client):
    """setup-status returns needs_setup=True before /initialize is called."""
    resp = client.get("/api/v1/auth/setup-status")
    assert resp.status_code == 200
    assert resp.json()["needs_setup"] is True


def test_setup_status_after_initialization(client):
    """setup-status returns needs_setup=False after /initialize succeeds."""
    client.post("/api/v1/auth/initialize", json=_init_payload())
    resp = client.get("/api/v1/auth/setup-status")
    assert resp.status_code == 200
    assert resp.json()["needs_setup"] is False


def test_setup_status_false_when_only_regular_user_exists(client):
    """setup-status returns needs_setup=True even when regular users exist (no admin)."""
    client.post("/api/v1/auth/register", json={"email": "regular@example.com", "password": "Tr0ub4dor3a"})
    resp = client.get("/api/v1/auth/setup-status")
    assert resp.status_code == 200
    assert resp.json()["needs_setup"] is True


def test_setup_status_returns_cached_result_on_rapid_calls(client):
    """Rapid /setup-status calls return the cached result (200) instead of 429."""
    client.post("/api/v1/auth/initialize", json=_init_payload())

    # First call succeeds and computes the result.
    resp1 = client.get("/api/v1/auth/setup-status")
    assert resp1.status_code == 200

    # Immediate second call returns cached result, not 429.
    resp2 = client.get("/api/v1/auth/setup-status")
    assert resp2.status_code == 200
    assert resp2.json() == resp1.json()
    assert resp2.json()["needs_setup"] is False


def test_setup_status_does_not_return_stale_true_after_initialize(client):
    """A pre-initialize setup-status response should not stay cached as True."""
    before = client.get("/api/v1/auth/setup-status")
    assert before.status_code == 200
    assert before.json()["needs_setup"] is True

    init = client.post("/api/v1/auth/initialize", json=_init_payload())
    assert init.status_code == 201

    after = client.get("/api/v1/auth/setup-status")
    assert after.status_code == 200
    assert after.json()["needs_setup"] is False


@pytest.mark.asyncio
async def test_setup_status_single_flight_per_ip(monkeypatch):
    """Concurrent requests from same IP share one in-flight DB query."""
    from starlette.requests import Request

    from app.gateway.routers.auth import (
        _SETUP_STATUS_CACHE,
        _SETUP_STATUS_INFLIGHT,
        setup_status,
    )

    class _Provider:
        def __init__(self):
            self.calls = 0

        async def count_admin_users(self):
            self.calls += 1
            await asyncio.sleep(0.05)
            return 0

    provider = _Provider()
    monkeypatch.setattr("app.gateway.routers.auth.get_local_provider", lambda: provider)
    _SETUP_STATUS_CACHE.clear()
    _SETUP_STATUS_INFLIGHT.clear()

    def _request() -> Request:
        return Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/api/v1/auth/setup-status",
                "headers": [],
                "client": ("127.0.0.1", 12345),
            }
        )

    results = await asyncio.gather(
        setup_status(_request()),
        setup_status(_request()),
        setup_status(_request()),
    )

    assert all(result["needs_setup"] is True for result in results)
    assert provider.calls == 1
