from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from _router_auth_helpers import make_authed_test_app
from fastapi.testclient import TestClient

from app.gateway.auth.models import User
from app.gateway.routers import knowledge_bases
from app.gateway.viking_knowledge import (
    VikingKnowledgeConfig,
    VikingKnowledgeConfigurationError,
    VikingKnowledgeService,
    VikingKnowledgeValidationError,
    generate_doc_id,
    infer_doc_type,
    validate_doc_name,
)


def _admin_user() -> User:
    return User(
        email="admin@example.com",
        password_hash="x",
        system_role="admin",
        id=uuid4(),
    )


def test_public_config_does_not_expose_credentials():
    service = VikingKnowledgeService(
        VikingKnowledgeConfig(
            api_key="secret-api-key",
            access_key_id="secret-ak",
            secret_access_key="secret-sk",
            collection_name="kb",
            tos_bucket="bucket",
        )
    )

    public_config = service.public_config()

    assert public_config["configured"] is True
    assert public_config["tos_configured"] is True
    assert public_config["default_collection_name"] == "kb"
    assert "api_key" not in public_config
    assert "secret_access_key" not in public_config
    assert "access_key_id" not in public_config


def test_dash_separated_collection_env_is_treated_as_resource_id(monkeypatch):
    monkeypatch.setenv("VIKINGDB_COLLECTION_NAME", "kb-3d563723e21cb935")
    monkeypatch.delenv("VIKINGDB_RESOURCE_ID", raising=False)

    config = VikingKnowledgeConfig.from_env()
    service = VikingKnowledgeService(config)

    assert config.collection_name is None
    assert config.resource_id == "kb-3d563723e21cb935"
    assert service.public_config()["default_collection_name"] == "kb-3d563723e21cb935"


def test_generate_doc_id_is_viking_safe():
    doc_id = generate_doc_id("2026 年产品说明.pdf")

    assert doc_id.startswith("doc_2026_")
    assert len(doc_id) <= 128
    assert doc_id.replace("_", "").isalnum()


@pytest.mark.parametrize(
    "doc_name",
    [
        "Manual.pdf",
        "知识_2026.pdf",
        "report-1.2.pdf",
    ],
)
def test_valid_doc_name_is_accepted(doc_name):
    assert validate_doc_name(doc_name) == doc_name


@pytest.mark.parametrize(
    "doc_name",
    [
        "",
        " Gmail.pdf",
        "Gmail - We're processing your order W1564078753.pdf",
        "bad/name.pdf",
        "bad:name.pdf",
        "a" * 256,
    ],
)
def test_invalid_doc_name_is_rejected(doc_name):
    with pytest.raises(VikingKnowledgeValidationError):
        validate_doc_name(doc_name)


def test_invalid_doc_id_is_rejected_before_upload(monkeypatch, tmp_path):
    service = VikingKnowledgeService(
        VikingKnowledgeConfig(
            access_key_id="ak",
            secret_access_key="sk",
            tos_bucket="bucket",
        )
    )
    monkeypatch.setattr(service, "_upload_to_tos", lambda *args, **kwargs: None)

    with pytest.raises(VikingKnowledgeConfigurationError):
        service.add_doc_from_tos_file(
            local_path=str(tmp_path / "file.txt"),
            filename="file.txt",
            collection_name="kb",
            doc_id="bad-id",
        )


def test_invalid_doc_name_is_rejected_before_upload(monkeypatch, tmp_path):
    service = VikingKnowledgeService(
        VikingKnowledgeConfig(
            access_key_id="ak",
            secret_access_key="sk",
            tos_bucket="bucket",
        )
    )
    monkeypatch.setattr(service, "_upload_to_tos", lambda *args, **kwargs: pytest.fail("should not upload invalid doc names"))

    with pytest.raises(VikingKnowledgeValidationError):
        service.add_doc_from_tos_file(
            local_path=str(tmp_path / "file.pdf"),
            filename="Gmail - We're processing your order W1564078753.pdf",
            collection_name="kb",
        )


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("manual.pdf", "pdf"),
        ("notes.md", "markdown"),
        ("photo.jpg", "jpeg"),
        ("photo.png", "png"),
        ("clip.mp4", "mp4"),
        ("audio.wav", "wav"),
        ("table.csv", "csv"),
    ],
)
def test_infer_doc_type(filename, expected):
    assert infer_doc_type(filename) == expected


class _FakeKnowledgeService:
    config = SimpleNamespace(upload_max_bytes=1024)

    def public_config(self):
        return {
            "configured": True,
            "tos_configured": True,
            "endpoint": "api-knowledgebase.mlp.cn-beijing.volces.com",
            "region": "cn-beijing",
            "project": "default",
            "default_collection_name": "kb",
            "upload_max_bytes": 1024,
        }

    def list_collections(self, *, project=None, brief=True):
        return {
            "collections": [{"collection_name": "kb", "doc_num": 1}],
            "project": project or "default",
            "default_collection_name": "kb",
        }

    def list_docs(self, *, collection_name, project=None, offset=0, limit=50):
        return {
            "docs": [{"doc_id": "doc_1", "doc_name": "Manual", "doc_type": "doc"}],
            "count": 1,
            "total_num": 1,
            "offset": offset,
            "limit": limit,
        }

    def get_doc(self, *, collection_name, doc_id, project=None):
        return {"doc_id": doc_id, "doc_name": "Manual"}

    def delete_doc(self, *, collection_name, doc_id, project=None):
        return {"doc_id": doc_id}

    def add_doc_from_tos_file(self, **kwargs):
        return {"result": {"doc_id": kwargs.get("doc_id") or "generated"}}


def _make_client():
    app = make_authed_test_app(user_factory=_admin_user)
    app.include_router(knowledge_bases.router)
    app.dependency_overrides[knowledge_bases.get_viking_knowledge_service] = _FakeKnowledgeService
    return TestClient(app)


def test_knowledge_config_route_returns_public_config():
    client = _make_client()

    response = client.get("/api/knowledge-bases/config")

    assert response.status_code == 200
    assert response.json()["default_collection_name"] == "kb"


def test_list_knowledge_docs_route():
    client = _make_client()

    response = client.get("/api/knowledge-bases/kb/docs")

    assert response.status_code == 200
    assert response.json()["docs"][0]["doc_id"] == "doc_1"


def test_upload_route_rejects_invalid_doc_name_before_service_call():
    client = _make_client()

    response = client.post(
        "/api/knowledge-bases/kb/docs",
        files={
            "file": (
                "Gmail - We're processing your order W1564078753.pdf",
                b"pdf",
                "application/pdf",
            )
        },
    )

    assert response.status_code == 422
    assert "doc_name" in response.json()["detail"]


def test_upload_route_rejects_non_pdf_files_before_service_call():
    client = _make_client()

    response = client.post(
        "/api/knowledge-bases/kb/docs",
        files={"file": ("manual.txt", b"text", "text/plain")},
    )

    assert response.status_code == 422
    assert "PDF" in response.json()["detail"]


def test_upload_route_rejects_non_pdf_doc_type_before_service_call():
    client = _make_client()

    response = client.post(
        "/api/knowledge-bases/kb/docs",
        data={"doc_type": "txt"},
        files={"file": ("manual.pdf", b"pdf", "application/pdf")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "doc_type must be pdf"
