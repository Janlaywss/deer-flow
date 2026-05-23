import { z } from "zod";

export const tokenUsageModelBreakdownSchema = z.object({
  tokens: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  runs: z.number(),
});

export const tokenUsageDailyBucketSchema = z.object({
  date: z.string(),
  total_tokens: z.number(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
  models: z.record(tokenUsageModelBreakdownSchema),
});

export const tokenUsageDashboardSchema = z.object({
  days: z.number(),
  start_date: z.string(),
  end_date: z.string(),
  total_tokens: z.number(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
  models: z.array(z.string()),
  buckets: z.array(tokenUsageDailyBucketSchema),
});

export type TokenUsageModelBreakdown = z.infer<
  typeof tokenUsageModelBreakdownSchema
>;
export type TokenUsageDailyBucket = z.infer<typeof tokenUsageDailyBucketSchema>;
export type TokenUsageDashboard = z.infer<typeof tokenUsageDashboardSchema>;
export type TokenUsageRange = 7 | 30;
