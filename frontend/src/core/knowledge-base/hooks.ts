import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteKnowledgeDoc,
  getKnowledgeConfig,
  getKnowledgeDoc,
  listKnowledgeBases,
  listKnowledgeDocs,
  uploadKnowledgeDoc,
} from "./api";
import type { UploadKnowledgeDocRequest } from "./types";

export function useKnowledgeConfig({
  enabled = true,
}: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["knowledge-base", "config"],
    queryFn: () => getKnowledgeConfig(),
    enabled,
  });
}

export function useKnowledgeBases({
  enabled = true,
}: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["knowledge-base", "collections"],
    queryFn: () => listKnowledgeBases(),
    enabled,
  });
}

export function useKnowledgeDocs(
  collectionName: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["knowledge-base", "docs", collectionName],
    queryFn: () => listKnowledgeDocs(collectionName ?? ""),
    enabled: enabled && Boolean(collectionName),
  });
}

export function useKnowledgeDoc(
  collectionName: string | null,
  docId: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["knowledge-base", "doc", collectionName, docId],
    queryFn: () => getKnowledgeDoc(collectionName ?? "", docId ?? ""),
    enabled: enabled && Boolean(collectionName && docId),
  });
}

export function useUploadKnowledgeDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UploadKnowledgeDocRequest) =>
      uploadKnowledgeDoc(request),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["knowledge-base", "docs", variables.collectionName],
      });
      void queryClient.invalidateQueries({
        queryKey: ["knowledge-base", "collections"],
      });
    },
  });
}

export function useDeleteKnowledgeDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteKnowledgeDoc,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [
          "knowledge-base",
          "doc",
          variables.collectionName,
          variables.docId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: ["knowledge-base", "docs", variables.collectionName],
      });
      void queryClient.invalidateQueries({
        queryKey: ["knowledge-base", "collections"],
      });
    },
  });
}
