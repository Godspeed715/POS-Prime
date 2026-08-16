import secrets
import jwt
import time
from core.settings import SECRET_KEY, ALGORITHM
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException
import hashlib


oauth2_bearer = OAuth2PasswordBearer('api/auth/login')

async def get_current_user(token = Depends(oauth2_bearer)):
    try:
        payload = jwt.decode(token, SECRET_KEY, [ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail="Invalid Token")
    
def get_access_token(username: str, role: str):
    payload = {
        'username': username,
        'role': role,
        'exp': time.time() + 60*60
    }
    return jwt.encode(payload, SECRET_KEY, ALGORITHM)

def get_refresh_token():
    return secrets.token_urlsafe(64)

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

