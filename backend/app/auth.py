import ssl
from dataclasses import dataclass
from functools import lru_cache

import certifi
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthedUser:
    id: str
    email: str | None
    token: str
    """Raw JWT, forwarded to Supabase PostgREST so Row Level Security applies."""


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    settings = get_settings()
    # urllib has no CA bundle on macOS framework Python; verify against certifi's.
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    return jwt.PyJWKClient(
        f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
        ssl_context=ssl_context,
    )


def decode_token(token: str) -> dict:
    settings = get_settings()
    header = jwt.get_unverified_header(token)
    alg = header.get("alg", "HS256")
    if alg == "HS256":
        # Legacy Supabase projects sign access tokens with the shared JWT secret.
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    # Newer projects use asymmetric signing keys published at the JWKS endpoint.
    signing_key = _jwks_client().get_signing_key_from_jwt(token).key
    return jwt.decode(token, signing_key, algorithms=[alg], audience="authenticated")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthedUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has no subject claim",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthedUser(id=user_id, email=payload.get("email"), token=credentials.credentials)
