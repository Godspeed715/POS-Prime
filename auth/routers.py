from fastapi import APIRouter, HTTPException, Response, Cookie
from auth.models import LoginRequest
from typing import Annotated
from auth.utils import get_access_token, get_refresh_token
MOCK_DB = {
    'roman': {'password': 'pass', 'role': 'cashier', 'refresh_token': None}
}

router = APIRouter(prefix='/api/auth', tags=['Auth'])

SessionCookie = Annotated[str | None, Cookie(description="The active login session token")]

@router.post('/login')
async def login(request: LoginRequest, response: Response):
    username = request.username
    password = request.password
    if username not in MOCK_DB:
        raise HTTPException(
            status_code=401,
            detail= 'User Not Found.'
        )
    if MOCK_DB[username]['password'] != password:
        raise HTTPException(
            status_code=401,
            detail= 'Password Incorrect.'
        )
    role = MOCK_DB[username]['role']
   
    access_token = get_access_token(username, role)
    refresh_token = get_refresh_token()

    MOCK_DB[username]['refresh_token'] = refresh_token
    response.set_cookie(
        key='refresh_token',
        value=refresh_token, 
        httponly=True, 
        secure=True,
        samesite='lax',
        path='/api/auth',
        max_age=60*60*24 * 30
    )
    
    return{
        'access_token': access_token, 
        'username': username,
        'role': role
    }

@router.post('/refresh')
async def refresh(refresh_token: SessionCookie = None):
    # -----------------Add change refresh_token----------------------------------
    refresh_tokens = {data['refresh_token']:user for user,data in MOCK_DB.items() if data['refresh_token'] is not None}
    if not refresh_token or refresh_token not in refresh_tokens:
        raise HTTPException(
            status_code=401,
            detail= "Missing or Broken refresh token cookie."
        )

    username = refresh_tokens[refresh_token]
    role = MOCK_DB[username]['role']
    access_token = get_access_token(username, role)
      
    return{
            'access_token': access_token, 
            'username': username,
            'role': role
        }
