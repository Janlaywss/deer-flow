import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

import {
  knowledgeBasesResponseSchema,
  knowledgeConfigSchema,
  knowledgeDocResponseSchema,
  knowledgeDocsResponseSchema,
  knowledgeUploadResponseSchema,
  type KnowledgeBase,
  type KnowledgeConfig,
  type KnowledgeDoc,
  type KnowledgeDocsResponse,
  type UploadKnowledgeDocRequest,
} from "./types";

function knowledgeBaseUrl(path = "") {
  return `${getBackendBaseURL()}/api/knowledge-bases${path}`;
}

async function parseApiError(res: Response): Promise<Error> {
  const data = await res.json().catch(() => null);
  const detail =
    typeof data?.detail === "string"
      ? data.detail
      : typeof data?.detail?.message === "string"
        ? data.detail.message
        : typeof data?.message === "string"
          ? data.message
          : res.statusText;
  return new Error(detail ?? "Knowledge base request failed");
}

export async function getKnowledgeConfig(): Promise<KnowledgeConfig> {
  const res = await fetch(knowledgeBaseUrl("/config"));
  if (!res.ok) throw await parseApiError(res);
  return knowledgeConfigSchema.parse(await res.json());
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const res = await fetch(knowledgeBaseUrl());
  if (!res.ok) throw await parseApiError(res);
  const data = knowledgeBasesResponseSchema.parse(await res.json());
  return data.collections;
}

export async function listKnowledgeDocs(
  collectionName: string,
): Promise<KnowledgeDocsResponse> {
  const res = await fetch(
    knowledgeBaseUrl(`/${encodeURIComponent(collectionName)}/docs`),
  );
  if (!res.ok) throw await parseApiError(res);
  return knowledgeDocsResponseSchema.parse(await res.json());
}

export async function getKnowledgeDoc(
  collectionName: string,
  docId: string,
): Promise<KnowledgeDoc> {
  const res = await fetch(
    knowledgeBaseUrl(
      `/${encodeURIComponent(collectionName)}/docs/${encodeURIComponent(docId)}`,
    ),
  );
  if (!res.ok) throw await parseApiError(res);
  const data = knowledgeDocResponseSchema.parse(await res.json());
  return data.doc;
}

export async function deleteKnowledgeDoc({
  collectionName,
  docId,
}: {
  collectionName: string;
  docId: string;
}): Promise<void> {
  const res = await fetch(
    knowledgeBaseUrl(
      `/${encodeURIComponent(collectionName)}/docs/${encodeURIComponent(docId)}`,
    ),
    { method: "DELETE" },
  );
  if (!res.ok) throw await parseApiError(res);
}

export async function uploadKnowledgeDoc(
  request: UploadKnowledgeDocRequest,
): Promise<Record<string, unknown>> {
  const formData = new FormData();
  formData.append("file", request.file);
  if (request.project) formData.append("project", request.project);
  if (request.docId) formData.append("doc_id", request.docId);
  if (request.docName) formData.append("doc_name", request.docName);
  if (request.docType) formData.append("doc_type", request.docType);
  if (request.description) formData.append("description", request.description);

  const res = await fetch(
    knowledgeBaseUrl(`/${encodeURIComponent(request.collectionName)}/docs`),
    {
      method: "POST",
      body: formData,
    },
  );
  if (!res.ok) throw await parseApiError(res);
  return knowledgeUploadResponseSchema.parse(await res.json()).result;
}
