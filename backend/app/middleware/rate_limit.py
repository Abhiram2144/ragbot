"""Per-org rate limiting — a FastAPI dependency, not global middleware, so
it only applies where explicitly added to a route's `Depends(...)` list.

Fixed-window counter in Redis, keyed by org_id from the JWT. API keys
aren't wired into request auth yet (a later stretch goal), so org_id is
the only tenant identity available today — this is NOT API-key-based
rate limiting, and the limit is one global value for every org, not
configurable per-org/per-plan.
"""

import time

import redis
from fastapi import Depends, HTTPException, status

from app.config import settings
from app.dependencies import CurrentUser, get_current_user

_WINDOW_SECONDS = 60

_redis = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def enforce_query_rate_limit(current_user: CurrentUser = Depends(get_current_user)) -> None:
    """Raise 429 (with Retry-After) once org_id exceeds
    settings.RATE_LIMIT_QUERIES_PER_MINUTE requests in the current 60s window.

    Window key: ratelimit:{org_id}:{current_minute_bucket}. TTL is set only
    on the increment that creates the key (count == 1), so it isn't pushed
    out on every subsequent request in the same window.
    """
    now = time.time()
    bucket = int(now // _WINDOW_SECONDS)
    key = f"ratelimit:{current_user.org_id}:{bucket}"

    count = _redis.incr(key)
    if count == 1:
        _redis.expire(key, _WINDOW_SECONDS)

    if count > settings.RATE_LIMIT_QUERIES_PER_MINUTE:
        retry_after = _WINDOW_SECONDS - int(now % _WINDOW_SECONDS)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )
