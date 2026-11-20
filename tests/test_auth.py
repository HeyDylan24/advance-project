import os
import time
import unittest
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import current_actor


class FakeSigningKey:
    def __init__(self, key):
        self.key = key


class FakeJwksClient:
    def __init__(self, key):
        self.signing_key = FakeSigningKey(key)

    def get_signing_key_from_jwt(self, token):
        return self.signing_key


class ClerkAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.client = FakeJwksClient(cls.private_key.public_key())

    def token(self, role="client", key=None):
        now = int(time.time())
        claims = {
            "iss": "https://clerk.example.test",
            "sub": "user_test",
            "iat": now,
            "exp": now + 60,
        }
        if role is not None:
            claims["metadata"] = {"role": role}
        return jwt.encode(claims, key or self.private_key, algorithm="RS256")

    def authenticate(self, token):
        with (
            patch.dict(
                os.environ,
                {
                    "CLERK_JWKS_URL": "https://clerk.example.test/.well-known/jwks.json",
                    "CLERK_ISSUER": "https://clerk.example.test",
                },
            ),
            patch("app.auth._jwks_client", return_value=self.client),
        ):
            return current_actor(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))

    def test_accepts_signed_client_role(self):
        self.assertEqual(
            self.authenticate(self.token()),
            {"user_id": "user_test", "role": "client"},
        )

    def test_defaults_missing_role_to_client(self):
        self.assertEqual(
            self.authenticate(self.token(role=None)),
            {"user_id": "user_test", "role": "client"},
        )

    def test_rejects_invalid_role(self):
        with self.assertRaises(HTTPException) as raised:
            self.authenticate(self.token(role="admin"))
        self.assertEqual(raised.exception.status_code, 403)

    def test_rejects_invalid_signature(self):
        other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        with self.assertRaises(HTTPException) as raised:
            self.authenticate(self.token(key=other_key))
        self.assertEqual(raised.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
