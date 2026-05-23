import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

import {
  tokenUsageDashboardSchema,
  type TokenUsageDashboard,
  type TokenUsageRange,
} from "./types";

export async function loadTokenUsageDashboard(
  days: TokenUsageRange,
): Promise<TokenUsageDashboard> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/token-usage/dashboard?days=${days}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load token usage: ${response.statusText}`);
  }
  return tokenUsageDashboardSchema.parse(await response.json());
}
