from urllib.parse import urlsplit

from fastapi import Request

from app.config import Settings

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def is_trusted_browser_request(request: Request, settings: Settings) -> bool:
    if request.method in SAFE_METHODS:
        return True
    if request.headers.get("sec-fetch-site", "").lower() == "cross-site":
        return False

    source_origin = request.headers.get("origin")
    if source_origin is None:
        referer = request.headers.get("referer")
        if referer:
            source_origin = _origin_from_url(referer)
            if source_origin is None:
                return False
    return source_origin is None or source_origin in settings.cors_origins


def _origin_from_url(value: str) -> str | None:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"
