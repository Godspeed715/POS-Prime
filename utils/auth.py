import secrets
import hashlib
import bcrypt
import asyncio
from random import randint
from functools import partial
from uuid import UUID
import jwt
import time
from core.settings import SECRET_KEY, ALGORITHM

def hash_password(plain_password: str) -> str:
    # bcrypt works on bytes, and truncates at 72 bytes internally
    password_bytes = plain_password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)  # 12 is a good default in 2026
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")  

def verify_password(plain_password: str, stored_hash: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        stored_hash.encode("utf-8")
    )

async def hash_password_async(plain_password: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, hash_password, plain_password)

async def verify_password_async(plain_password: str, stored_hash: str) -> bool:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, verify_password, plain_password, stored_hash)

def get_access_token(username: str, role: str, business_id: UUID | None = None) -> str:
    payload = {
        "username": username,
        "role": role,
        "business_id": str(business_id) if business_id else None,
        'exp': time.time() + 60*60
    }
    return jwt.encode(payload, SECRET_KEY, ALGORITHM)


def get_refresh_token():
    return secrets.token_urlsafe(64)

def hash_token(token: str) -> str:
    if not token:
        return None
    return hashlib.sha256(token.encode()).hexdigest()

def get_slug(business_name: str) -> str:
    parts = business_name.split()
    num_suffix = randint(1, 100)
    num_suffix = '0'+str(num_suffix) if num_suffix<10 else str(num_suffix)

    if len(parts)==1:
        return parts[0].lower() + '_' + num_suffix
    else:
        return '_'.join(parts[:2]).lower() + '_' + num_suffix


