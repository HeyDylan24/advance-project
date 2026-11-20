import logging
import os
from functools import lru_cache
from typing import Literal, TypedDict

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


class Actor(TypedDict):
    user_id: str
    role: Literal["client", "analyst"]


@lru_cache(maxsize=1)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True)


def current_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Actor:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Sign in to continue.")

    jwks_url = os.environ.get("CLERK_JWKS_URL", "").strip()
    issuer = os.environ.get("CLERK_ISSUER", "").strip()
    if not jwks_url or not issuer:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured. Set CLERK_JWKS_URL and CLERK_ISSUER.",
        )

    try:
        signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(
            credentials.credentials
        )
        claims = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            issuer=issuer,
            options={"require": ["exp", "iat", "sub"]},
        )
    except PyJWKClientConnectionError as error:
        logger.exception("Could not retrieve Clerk signing keys")
        raise HTTPException(
            status_code=503, detail="Could not verify sign-in right now."
        ) from error
    except PyJWKClientError as error:
        raise HTTPException(status_code=401, detail="Invalid sign-in token.") from error
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail="Invalid sign-in token.") from error

    metadata = claims.get("metadata")
    role = metadata.get("role") if isinstance(metadata, dict) else None
    user_id = claims.get("sub")
    if role not in ("client", "analyst") or not isinstance(user_id, str):
        raise HTTPException(
            status_code=403,
            detail="Your account needs a client or analyst role in Clerk.",
        )
    return {"user_id": user_id, "role": role}


def require_role(role: Literal["client", "analyst"]):
    def role_dependency(actor: Actor = Depends(current_actor)) -> Actor:
        if actor["role"] != role:
            raise HTTPException(status_code=403, detail="You do not have access to this action.")
        return actor

    return role_dependency
