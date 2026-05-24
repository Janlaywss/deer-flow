import { z } from "zod";

const recordSchema = z.object({}).catchall(z.unknown());

export const knowledgeConfigSchema = z.object({
  configured: z.boolean(),
  tos_configured: z.boolean(),
  endpoint: z.string(),
  region: z.string(),
  project: z.string(),
  default_collection_name: z.string().nullable().optional(),
  upload_max_bytes: z.number(),
});

export const knowledgeBaseSchema = recordSchema.extend({
  collection_name: z.string().optional(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  doc_num: z.number().nullable().optional(),
  project: z.string().nullable().optional(),
  resource_id: z.string().nullable().optional(),
  create_time: z.union([z.string(), z.number()]).nullable().optional(),
  update_time: z.union([z.string(), z.number()]).nullable().optional(),
});

export const knowledgeBasesResponseSchema = z.object({
  collections: z.array(knowledgeBaseSchema),
  project: z.string(),
  default_collection_name: z.string().nullable().optional(),
});

export const knowledgeDocSchema = recordSchema.extend({
  collection_name: z.string().nullable().optional(),
  doc_name: z.string().nullable().optional(),
  doc_id: z.string(),
  doc_type: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  add_type: z.string().nullable().optional(),
  doc_size: z.number().nullable().optional(),
  point_num: z.number().nullable().optional(),
  create_time: z.number().nullable().optional(),
  update_time: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
  tos_path: z.string().nullable().optional(),
  status: recordSchema.nullable().optional(),
  doc_summary: z.string().nullable().optional(),
  brief_summary: z.string().nullable().optional(),
  labels: recordSchema.nullable().optional(),
});

export const knowledgeDocsResponseSchema = z.object({
  docs: z.array(knowledgeDocSchema),
  count: z.number(),
  total_num: z.number(),
  offset: z.number(),
  limit: z.number(),
});

export const knowledgeDocResponseSchema = z.object({
  doc: knowledgeDocSchema,
});

export const knowledgeUploadResponseSchema = z.object({
  success: z.boolean(),
  result: recordSchema,
});

export interface UploadKnowledgeDocRequest {
  collectionName: string;
  file: File;
  project?: string;
  docId?: string;
  docName?: string;
  docType?: string;
  description?: string;
}

export type KnowledgeConfig = z.infer<typeof knowledgeConfigSchema>;
export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>;
export type KnowledgeDoc = z.infer<typeof knowledgeDocSchema>;
export type KnowledgeDocsResponse = z.infer<typeof knowledgeDocsResponseSchema>;
