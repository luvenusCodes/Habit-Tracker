import time
from collections import defaultdict, deque
from threading import Lock
from fastapi import HTTPException, Request, status

class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def __call__(self, request: Request) -> None:
        forwarded_for = request.headers.get("X-Forwarded-For")
        client_ip = (
            forwarded_for.split(",")[0].strip()
            if forwarded_for
            else (request.client.host if request.client else "unknown")
        )
        key = f"{request.url.path}:{client_ip}"
        now = time.monotonic()
        cutoff = now - self.window_seconds

        with self._lock:
            timestamps = self._hits[key]
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()

            if len(timestamps) >= self.max_requests:
                retry_after = max(1, int(self.window_seconds - (now - timestamps[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many requests. Please try again in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )

            timestamps.append(now)

# Reusable dependency instances
login_rate_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=300)   # 10 attempts / 5 min
otp_rate_limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=600)      # 5 OTP requests / 10 min