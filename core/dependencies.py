from core.settings import SECRET_KEY, ALGORITHM
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException
import jwt


# Used to automatically check for Access Token in Header
# Defines the login url for swagger docs
oauth2_bearer = OAuth2PasswordBearer('api/auth/login')

# Checks if the access token is valid and returns the user's payload
async def get_current_user(token = Depends(oauth2_bearer)):
    try:
        payload = jwt.decode(token, SECRET_KEY, [ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail="Invalid Token")
    

