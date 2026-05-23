"""Token usage dashboard endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.gateway.deps import get_current_user, get_run_store

router = APIRouter(prefix="/api/token-usage", tags=["token-usage"])


class TokenUsageModelBreakdown(BaseModel):
    tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    runs: int = 0


class TokenUsageDailyBucket(BaseModel):
    date: str
    total_tokens: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    models: dict[str, TokenUsageModelBreakdown] = Field(default_factory=dict)


class TokenUsageDashboardResponse(BaseModel):
    days: int
    start_date: str
    end_date: str
    total_tokens: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    models: list[str] = Field(default_factory=list)
    buckets: list[TokenUsageDailyBucket] = Field(default_factory=list)


@router.get("/dashboard", response_model=TokenUsageDashboardResponse)
async def token_usage_dashboard(
    request: Request,
    days: int = Query(default=7, description="Dashboard range. Supported values: 7 or 30."),
) -> TokenUsageDashboardResponse:
    """Return current user's daily token usage grouped by model."""
    if days not in (7, 30):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="days must be 7 or 30")

    user_id = await get_current_user(request)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    end_date = datetime.now(UTC).date()
    start_date = end_date - timedelta(days=days - 1)
    buckets_by_date = {(start_date + timedelta(days=index)).isoformat(): TokenUsageDailyBucket(date=(start_date + timedelta(days=index)).isoformat()) for index in range(days)}

    rows = await get_run_store(request).aggregate_daily_tokens_by_user(user_id, days=days)
    model_names: set[str] = set()
    total_tokens = total_input_tokens = total_output_tokens = 0

    for row in rows:
        date = str(row["date"])
        bucket = buckets_by_date.get(date)
        if bucket is None:
            continue

        model = str(row["model"] or "unknown")
        model_names.add(model)
        tokens = int(row["total_tokens"] or 0)
        input_tokens = int(row["total_input_tokens"] or 0)
        output_tokens = int(row["total_output_tokens"] or 0)
        runs = int(row["runs"] or 0)

        bucket.total_tokens += tokens
        bucket.total_input_tokens += input_tokens
        bucket.total_output_tokens += output_tokens
        bucket.models[model] = TokenUsageModelBreakdown(
            tokens=tokens,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            runs=runs,
        )

        total_tokens += tokens
        total_input_tokens += input_tokens
        total_output_tokens += output_tokens

    return TokenUsageDashboardResponse(
        days=days,
        start_date=start_date.isoformat(),
        end_date=end_date.isoformat(),
        total_tokens=total_tokens,
        total_input_tokens=total_input_tokens,
        total_output_tokens=total_output_tokens,
        models=sorted(model_names),
        buckets=list(buckets_by_date.values()),
    )
