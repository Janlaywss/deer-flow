import { useQuery } from "@tanstack/react-query";

import { loadTokenUsageDashboard } from "./api";
import type { TokenUsageRange } from "./types";

export function useTokenUsageDashboard(days: TokenUsageRange) {
  return useQuery({
    queryKey: ["token-usage", "dashboard", days],
    queryFn: () => loadTokenUsageDashboard(days),
  });
}
