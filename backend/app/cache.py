import time
from typing import Any


class TTLCache:
    """Minimal in-process TTL cache. Suitable for a single web instance."""

    def __init__(self, ttl_seconds: float):
        self.ttl = ttl_seconds
        self._store: dict[Any, tuple[float, Any]] = {}

    def get(self, key: Any) -> Any | None:
        item = self._store.get(key)
        if item is None:
            return None
        expires_at, value = item
        if time.monotonic() > expires_at:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: Any, value: Any) -> None:
        self._store[key] = (time.monotonic() + self.ttl, value)
