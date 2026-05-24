"""Viking knowledge base integration for the API gateway."""

from __future__ import annotations

import json
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

DEFAULT_VIKING_ENDPOINT = "api-knowledgebase.mlp.cn-beijing.volces.com"
DEFAULT_VIKING_REGION = "cn-beijing"
DEFAULT_TOS_ENDPOINT = "tos-cn-beijing.volces.com"
DEFAULT_UPLOAD_PREFIX = "deer-flow/knowledge"
MAX_DOC_ID_LENGTH = 128
MAX_DOC_NAME_LENGTH = 255

_DOC_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
_DOC_NAME_RE = re.compile(r"^[\w.-]+$")
_IMAGE_DOC_TYPES = {"jpeg", "png", "webp", "bmp"}


class VikingKnowledgeConfigurationError(RuntimeError):
    """Raised when the Viking knowledge base integration is not configured."""


class VikingKnowledgeValidationError(VikingKnowledgeConfigurationError):
    """Raised when user supplied Viking knowledge fields are invalid."""


class VikingKnowledgeServiceError(RuntimeError):
    """Raised when a Viking or TOS operation fails."""


@dataclass(frozen=True)
class VikingKnowledgeConfig:
    endpoint: str = DEFAULT_VIKING_ENDPOINT
    region: str = DEFAULT_VIKING_REGION
    scheme: str = "https"
    project: str = "default"
    collection_name: str | None = None
    resource_id: str | None = None
    api_key: str | None = None
    access_key_id: str | None = None
    secret_access_key: str | None = None
    timeout: int = 30
    tos_bucket: str | None = None
    tos_endpoint: str = DEFAULT_TOS_ENDPOINT
    tos_region: str = DEFAULT_VIKING_REGION
    tos_prefix: str = DEFAULT_UPLOAD_PREFIX
    upload_max_bytes: int = 500 * 1024 * 1024

    @classmethod
    def from_env(cls) -> VikingKnowledgeConfig:
        raw_collection_name = _getenv("VIKINGDB_COLLECTION_NAME")
        resource_id = _getenv("VIKINGDB_RESOURCE_ID")
        collection_name = raw_collection_name
        if raw_collection_name and not _is_valid_collection_name(raw_collection_name):
            resource_id = resource_id or raw_collection_name
            collection_name = None

        return cls(
            endpoint=_getenv("VIKINGDB_ENDPOINT", DEFAULT_VIKING_ENDPOINT),
            region=_getenv("VIKINGDB_REGION", DEFAULT_VIKING_REGION),
            scheme=_getenv("VIKINGDB_SCHEME", "https"),
            project=_getenv("VIKINGDB_PROJECT", "default"),
            collection_name=collection_name,
            resource_id=resource_id,
            api_key=_getenv("VIKINGDB_API_KEY"),
            access_key_id=_getenv(
                "VIKINGDB_ACCESS_KEY_ID",
                _getenv("VOLCENGINE_ACCESS_KEY_ID", _getenv("VOLCENGINE_AK")),
            ),
            secret_access_key=_getenv(
                "VIKINGDB_SECRET_ACCESS_KEY",
                _getenv("VOLCENGINE_SECRET_ACCESS_KEY", _getenv("VOLCENGINE_SK")),
            ),
            timeout=_getenv_int("VIKINGDB_TIMEOUT_SECONDS", 30),
            tos_bucket=_getenv("VIKINGDB_TOS_BUCKET", _getenv("TOS_BUCKET")),
            tos_endpoint=_getenv("VIKINGDB_TOS_ENDPOINT", DEFAULT_TOS_ENDPOINT),
            tos_region=_getenv("VIKINGDB_TOS_REGION", DEFAULT_VIKING_REGION),
            tos_prefix=_getenv("VIKINGDB_TOS_PREFIX", DEFAULT_UPLOAD_PREFIX).strip("/"),
            upload_max_bytes=_getenv_int("VIKINGDB_UPLOAD_MAX_BYTES", 500 * 1024 * 1024),
        )

    @property
    def configured(self) -> bool:
        return bool(self.api_key or (self.access_key_id and self.secret_access_key))

    @property
    def tos_configured(self) -> bool:
        return bool(self.access_key_id and self.secret_access_key and self.tos_bucket)


def _getenv(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _getenv_int(name: str, default: int) -> int:
    value = _getenv(name)
    if value is None:
        return default
    try:
        parsed = int(value)
        if parsed <= 0:
            raise ValueError
        return parsed
    except ValueError:
        return default


def _model_to_dict(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        value = value.model_dump(by_alias=True, exclude_none=True)
    elif hasattr(value, "dict"):
        value = value.dict(by_alias=True, exclude_none=True)

    if isinstance(value, dict):
        return {key: _model_to_dict(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_model_to_dict(item) for item in value]
    return value


def _safe_doc_id(value: str) -> str:
    if not _DOC_ID_RE.fullmatch(value):
        raise VikingKnowledgeValidationError("doc_id must start with a letter or underscore and contain only letters, numbers, and underscores")
    return value


def validate_doc_name(value: str) -> str:
    if not (1 <= len(value) <= MAX_DOC_NAME_LENGTH) or not _DOC_NAME_RE.fullmatch(value):
        raise VikingKnowledgeValidationError("doc_name must be 1-255 characters and contain only letters, numbers, underscores, hyphens, and periods; spaces and special characters are not allowed")
    return value


def _is_valid_collection_name(value: str) -> bool:
    return bool(_DOC_ID_RE.fullmatch(value))


def generate_doc_id(filename: str) -> str:
    stem = Path(filename).stem
    normalized = re.sub(r"[^A-Za-z0-9_]+", "_", stem).strip("_").lower()
    if not normalized:
        normalized = "doc"
    if not re.match(r"^[A-Za-z_]", normalized):
        normalized = f"doc_{normalized}"
    suffix = uuid4().hex[:12]
    max_stem_length = MAX_DOC_ID_LENGTH - len(suffix) - 1
    return f"{normalized[:max_stem_length]}_{suffix}"


def infer_doc_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    doc_types = {
        ".txt": "txt",
        ".doc": "doc",
        ".docx": "docx",
        ".pdf": "pdf",
        ".md": "markdown",
        ".markdown": "markdown",
        ".pptx": "pptx",
        ".ppt": "ppt",
        ".jpg": "jpeg",
        ".jpeg": "jpeg",
        ".png": "png",
        ".webp": "webp",
        ".bmp": "bmp",
        ".mp4": "mp4",
        ".mp3": "mp3",
        ".wav": "wav",
        ".aac": "aac",
        ".flac": "flac",
        ".ogg": "ogg",
        ".xlsx": "xlsx",
        ".csv": "csv",
        ".jsonl": "jsonl",
    }
    return doc_types.get(ext, "doc")


class VikingKnowledgeService:
    def __init__(self, config: VikingKnowledgeConfig | None = None):
        self.config = config or VikingKnowledgeConfig.from_env()

    def public_config(self) -> dict[str, Any]:
        return {
            "configured": self.config.configured,
            "tos_configured": self.config.tos_configured,
            "endpoint": self.config.endpoint,
            "region": self.config.region,
            "project": self.config.project,
            "default_collection_name": self.config.collection_name or self.config.resource_id,
            "upload_max_bytes": self.config.upload_max_bytes,
        }

    def list_collections(self, *, project: str | None = None, brief: bool = True) -> dict[str, Any]:
        self._ensure_configured()
        client = self._client()

        from volcengine.ApiInfo import ApiInfo

        client.api_info["ListKnowledgeCollections"] = ApiInfo(
            "POST",
            "/api/knowledge/collection/list",
            {},
            {},
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "deer-flow",
            },
        )

        body: dict[str, Any] = {"brief": brief}
        effective_project = project or self.config.project
        if effective_project:
            body["project"] = effective_project

        response = client.json_exception(
            "ListKnowledgeCollections",
            {},
            json.dumps(body, ensure_ascii=False),
            timeout=self.config.timeout,
        )
        collections = self._extract_collection_list(response)
        return {
            "collections": collections,
            "project": effective_project,
            "default_collection_name": self.config.collection_name,
        }

    def list_docs(
        self,
        *,
        collection_name: str,
        project: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> dict[str, Any]:
        self._ensure_configured()
        from vikingdb.knowledge.models.doc import ListDocsRequest

        collection = self._collection(collection_name=collection_name, project=project)
        response = collection.list_docs(ListDocsRequest(offset=offset, limit=limit), timeout=self.config.timeout)
        payload = _model_to_dict(response)
        result = payload.get("result") or payload.get("data") or {}
        docs = result.get("doc_list") or []
        return {
            "docs": docs,
            "count": result.get("count", len(docs)),
            "total_num": result.get("total_num", result.get("count", len(docs))),
            "offset": offset,
            "limit": limit,
        }

    def get_doc(self, *, collection_name: str, doc_id: str, project: str | None = None) -> dict[str, Any]:
        self._ensure_configured()
        collection = self._collection(collection_name=collection_name, project=project)
        response = collection.get_doc(doc_id, timeout=self.config.timeout)
        return _model_to_dict(response)

    def delete_doc(self, *, collection_name: str, doc_id: str, project: str | None = None) -> dict[str, Any]:
        self._ensure_configured()
        collection = self._collection(collection_name=collection_name, project=project)
        response = collection.delete_doc(doc_id, timeout=self.config.timeout)
        return _model_to_dict(response)

    def add_doc_from_tos_file(
        self,
        *,
        local_path: str,
        filename: str,
        collection_name: str,
        project: str | None = None,
        doc_id: str | None = None,
        doc_name: str | None = None,
        doc_type: str | None = None,
        description: str | None = None,
    ) -> dict[str, Any]:
        self._ensure_configured()
        self._ensure_tos_configured()

        effective_doc_name = doc_name or filename
        validate_doc_name(effective_doc_name)
        effective_doc_id = _safe_doc_id(doc_id.strip()) if doc_id else generate_doc_id(filename)
        object_key = self._object_key(collection_name, effective_doc_id, filename)
        self._upload_to_tos(local_path, object_key, effective_doc_id)
        uri = f"tos://{self.config.tos_bucket}/{object_key}"
        return self.add_doc_from_uri(
            collection_name=collection_name,
            project=project,
            doc_id=effective_doc_id,
            doc_name=effective_doc_name,
            doc_type=doc_type or infer_doc_type(filename),
            description=description,
            uri=uri,
        )

    def add_doc_from_uri(
        self,
        *,
        collection_name: str,
        doc_id: str,
        doc_name: str | None,
        doc_type: str,
        uri: str,
        project: str | None = None,
        description: str | None = None,
    ) -> dict[str, Any]:
        self._ensure_configured()
        from vikingdb.knowledge.models.doc import AddDocV2Request

        if doc_name is not None:
            validate_doc_name(doc_name)
        collection = self._collection(collection_name=collection_name, project=project)
        response = collection.add_doc_v2(
            AddDocV2Request(
                doc_id=_safe_doc_id(doc_id),
                doc_name=doc_name,
                doc_type=doc_type,
                description=description if doc_type in _IMAGE_DOC_TYPES else None,
                uri=uri,
            ),
            timeout=self.config.timeout,
        )
        return _model_to_dict(response)

    def _client(self):
        try:
            from vikingdb.auth import IAM, APIKey
            from vikingdb.knowledge import VikingKnowledge
        except ImportError as exc:
            raise VikingKnowledgeConfigurationError("Missing Viking SDK dependency. Install backend dependencies with `cd backend && uv sync`.") from exc

        if self.config.api_key:
            auth = APIKey(api_key=self.config.api_key)
        elif self.config.access_key_id and self.config.secret_access_key:
            auth = IAM(ak=self.config.access_key_id, sk=self.config.secret_access_key)
        else:
            raise VikingKnowledgeConfigurationError("Set VIKINGDB_API_KEY or both VIKINGDB_ACCESS_KEY_ID and VIKINGDB_SECRET_ACCESS_KEY.")

        return VikingKnowledge(
            host=self.config.endpoint,
            region=self.config.region,
            auth=auth,
            scheme=self.config.scheme,
            timeout=self.config.timeout,
        )

    def _collection(self, *, collection_name: str, project: str | None):
        if not collection_name:
            raise VikingKnowledgeConfigurationError("Knowledge base collection_name is required.")
        if self.config.resource_id and collection_name == self.config.resource_id:
            return self._client().collection(resource_id=self.config.resource_id)
        if not _is_valid_collection_name(collection_name):
            return self._client().collection(resource_id=collection_name)
        return self._client().collection(
            collection_name=collection_name,
            project_name=project or self.config.project,
        )

    def _ensure_configured(self) -> None:
        if not self.config.configured:
            raise VikingKnowledgeConfigurationError("Set VIKINGDB_API_KEY or both VIKINGDB_ACCESS_KEY_ID and VIKINGDB_SECRET_ACCESS_KEY.")

    def _ensure_tos_configured(self) -> None:
        if not self.config.tos_configured:
            raise VikingKnowledgeConfigurationError("File upload requires VIKINGDB_TOS_BUCKET plus VIKINGDB_ACCESS_KEY_ID and VIKINGDB_SECRET_ACCESS_KEY.")

    def _upload_to_tos(self, local_path: str, object_key: str, doc_id: str) -> None:
        try:
            import tos
        except ImportError as exc:
            raise VikingKnowledgeConfigurationError("Missing TOS SDK dependency. Install backend dependencies with `cd backend && uv sync`.") from exc

        client = tos.TosClientV2(
            self.config.access_key_id,
            self.config.secret_access_key,
            self.config.tos_endpoint,
            self.config.tos_region,
        )
        try:
            client.put_object_from_file(
                self.config.tos_bucket,
                object_key,
                local_path,
                meta={"doc_id": doc_id},
            )
        except Exception as exc:
            raise VikingKnowledgeServiceError(self._format_tos_upload_error(exc)) from exc

    def _format_tos_upload_error(self, exc: Exception) -> str:
        details = [
            "Failed to upload file to TOS.",
            f"bucket={self.config.tos_bucket}",
            f"endpoint={self.config.tos_endpoint}",
            f"region={self.config.tos_region}",
            f"prefix={self.config.tos_prefix or '/'}",
        ]
        request_id = getattr(exc, "request_id", None)
        if request_id:
            details.append(f"request_id={request_id}")

        status_code = getattr(exc, "status_code", None)
        code = getattr(exc, "code", None)
        error_text = str(exc)
        if status_code == 403 or code == "AccessDenied" or "AccessDenied" in error_text or "Access Denied" in error_text:
            details.append("TOS access denied. Grant this AK/SK TOS PutObject/GetObject/HeadBucket permissions for the configured bucket, or set VIKINGDB_TOS_BUCKET to a bucket owned by this account.")
        else:
            details.append(error_text)
        return " ".join(details)

    def _object_key(self, collection_name: str, doc_id: str, filename: str) -> str:
        collection_part = re.sub(r"[^A-Za-z0-9_/-]+", "_", collection_name).strip("/_") or "collection"
        suffix = Path(filename).suffix.lower()
        return f"{self.config.tos_prefix}/{collection_part}/{doc_id}{suffix}".lstrip("/")

    def _extract_collection_list(self, response: dict[str, Any]) -> list[dict[str, Any]]:
        data = response.get("data") or response.get("result") or response
        if isinstance(data, dict):
            candidates = data.get("collection_list") or data.get("collections") or data.get("items") or data.get("list") or data.get("result_list")
        else:
            candidates = data

        if not isinstance(candidates, list):
            return []

        normalized: list[dict[str, Any]] = []
        for item in candidates:
            if not isinstance(item, dict):
                continue
            normalized_item = dict(item)
            if "collection_name" not in normalized_item and "name" in normalized_item:
                normalized_item["collection_name"] = normalized_item["name"]
            normalized.append(normalized_item)
        return normalized


def create_temp_upload(suffix: str | None = None) -> tuple[int, str]:
    fd, path = tempfile.mkstemp(prefix="deerflow-viking-", suffix=suffix or "")
    return fd, path
