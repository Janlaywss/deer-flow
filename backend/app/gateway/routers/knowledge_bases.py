"""Admin routes for Viking knowledge base management."""

from __future__ import annotations

import asyncio
import os
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field

from app.gateway.deps import get_current_user_from_request
from app.gateway.viking_knowledge import (
    VikingKnowledgeConfigurationError,
    VikingKnowledgeService,
    VikingKnowledgeServiceError,
    VikingKnowledgeValidationError,
    create_temp_upload,
    validate_doc_name,
)

router = APIRouter(prefix="/api/knowledge-bases", tags=["knowledge-bases"])

UPLOAD_CHUNK_SIZE = 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {".pdf"}
ALLOWED_DOC_TYPES = {"pdf"}


class KnowledgeConfigResponse(BaseModel):
    configured: bool
    tos_configured: bool
    endpoint: str
    region: str
    project: str
    default_collection_name: str | None = None
    upload_max_bytes: int


class KnowledgeBaseListResponse(BaseModel):
    collections: list[dict[str, Any]]
    project: str
    default_collection_name: str | None = None


class KnowledgeDocListResponse(BaseModel):
    docs: list[dict[str, Any]]
    count: int
    total_num: int
    offset: int
    limit: int


class KnowledgeDocResponse(BaseModel):
    doc: dict[str, Any]


class KnowledgeDeleteResponse(BaseModel):
    success: bool = True
    result: dict[str, Any] = Field(default_factory=dict)


class KnowledgeUploadResponse(BaseModel):
    success: bool = True
    result: dict[str, Any]


def get_viking_knowledge_service() -> VikingKnowledgeService:
    return VikingKnowledgeService()


async def require_admin_user(request: Request) -> None:
    current_user = getattr(request.state, "user", None)
    if current_user is None:
        current_user = await get_current_user_from_request(request)
    if current_user.system_role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def _to_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, VikingKnowledgeValidationError):
        return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    if isinstance(exc, VikingKnowledgeConfigurationError):
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    if isinstance(exc, VikingKnowledgeServiceError):
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Viking knowledge base request failed: {exc}",
    )


def _validate_pdf_upload(filename: str, doc_type: str | None) -> None:
    if os.path.splitext(filename)[1].lower() not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Only PDF files are allowed",
        )
    if doc_type and doc_type.lower() not in ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="doc_type must be pdf",
        )


@router.get(
    "/config",
    response_model=KnowledgeConfigResponse,
    dependencies=[Depends(require_admin_user)],
)
async def get_knowledge_config(
    service: VikingKnowledgeService = Depends(get_viking_knowledge_service),
) -> KnowledgeConfigResponse:
    return KnowledgeConfigResponse(**service.public_config())


@router.get(
    "",
    response_model=KnowledgeBaseListResponse,
    dependencies=[Depends(require_admin_user)],
)
async def list_knowledge_bases(
    project: str | None = None,
    brief: bool = True,
    service: VikingKnowledgeService = Depends(get_viking_knowledge_service),
) -> KnowledgeBaseListResponse:
    try:
        result = await asyncio.to_thread(service.list_collections, project=project, brief=brief)
        return KnowledgeBaseListResponse(**result)
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.get(
    "/{collection_name}/docs",
    response_model=KnowledgeDocListResponse,
    dependencies=[Depends(require_admin_user)],
)
async def list_knowledge_docs(
    collection_name: str,
    project: str | None = None,
    offset: int = 0,
    limit: int = 50,
    service: VikingKnowledgeService = Depends(get_viking_knowledge_service),
) -> KnowledgeDocListResponse:
    try:
        result = await asyncio.to_thread(
            service.list_docs,
            collection_name=collection_name,
            project=project,
            offset=offset,
            limit=limit,
        )
        return KnowledgeDocListResponse(**result)
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.get(
    "/{collection_name}/docs/{doc_id}",
    response_model=KnowledgeDocResponse,
    dependencies=[Depends(require_admin_user)],
)
async def get_knowledge_doc(
    collection_name: str,
    doc_id: str,
    project: str | None = None,
    service: VikingKnowledgeService = Depends(get_viking_knowledge_service),
) -> KnowledgeDocResponse:
    try:
        doc = await asyncio.to_thread(
            service.get_doc,
            collection_name=collection_name,
            doc_id=doc_id,
            project=project,
        )
        return KnowledgeDocResponse(doc=doc)
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.delete(
    "/{collection_name}/docs/{doc_id}",
    response_model=KnowledgeDeleteResponse,
    dependencies=[Depends(require_admin_user)],
)
async def delete_knowledge_doc(
    collection_name: str,
    doc_id: str,
    project: str | None = None,
    service: VikingKnowledgeService = Depends(get_viking_knowledge_service),
) -> KnowledgeDeleteResponse:
    try:
        result = await asyncio.to_thread(
            service.delete_doc,
            collection_name=collection_name,
            doc_id=doc_id,
            project=project,
        )
        return KnowledgeDeleteResponse(result=result)
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.post(
    "/{collection_name}/docs",
    response_model=KnowledgeUploadResponse,
    dependencies=[Depends(require_admin_user)],
)
async def upload_knowledge_doc(
    collection_name: str,
    file: UploadFile = File(...),
    project: str | None = Form(default=None),
    doc_id: str | None = Form(default=None),
    doc_name: str | None = Form(default=None),
    doc_type: str | None = Form(default=None),
    description: str | None = Form(default=None),
    service: VikingKnowledgeService = Depends(get_viking_knowledge_service),
) -> KnowledgeUploadResponse:
    filename = file.filename or "document"
    _validate_pdf_upload(filename, doc_type)
    try:
        validate_doc_name(doc_name or filename)
    except VikingKnowledgeValidationError as exc:
        raise _to_http_error(exc) from exc

    suffix = os.path.splitext(filename)[1]
    fd, temp_path = create_temp_upload(suffix=suffix)
    total_size = 0

    try:
        with os.fdopen(fd, "wb") as fh:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                total_size += len(chunk)
                if total_size > service.config.upload_max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File too large",
                    )
                fh.write(chunk)

        result = await asyncio.to_thread(
            service.add_doc_from_tos_file,
            local_path=temp_path,
            filename=filename,
            collection_name=collection_name,
            project=project,
            doc_id=doc_id,
            doc_name=doc_name,
            doc_type=doc_type,
            description=description,
        )
        return KnowledgeUploadResponse(result=result)
    except HTTPException:
        raise
    except Exception as exc:
        raise _to_http_error(exc) from exc
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass
