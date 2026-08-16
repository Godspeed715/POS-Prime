from fastapi import APIRouter, HTTPException, Response, Cookie, Depends
from auth.models import LoginRequest
from typing import Annotated
from core.database import get_db
from auth.utils import *
from auth.queries import *
from datetime import datetime, timedelta, timezone

  
router = APIRouter(prefix='/api/auth', tags=['Auth'])

SessionCookie = Annotated[str | None, Cookie(description="The active login session token")]

@router.post('/login')
async def login(request: LoginRequest, response: Response, aconn = Depends(get_db)):
    username = request.username
    password = request.password
    if not await user_exists(aconn, username):
        raise HTTPException(
            status_code=401,
            detail= 'User Not Found.'
        )
    user_data = await get_user_auth_data(aconn, username)
    if  password!=user_data['password_hash']:
        raise HTTPException(
            status_code=401,
            detail= 'Password Incorrect.'
        )
    
    role = user_data['role']
   
    access_token = get_access_token(username, role)
    refresh_token = get_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    await set_refresh_token(aconn, user_data['id'], hash_token(refresh_token), expires_at)

    response.set_cookie(
        key='refresh_token',
        value=refresh_token, 
        httponly=True, 
        secure=True,
        samesite='lax',
        path='/api/auth',
        max_age=60*60*24 *7 #change 7 for the number of days
    )
    
    return{
        'access_token': access_token, 
        'username': user_data['username'],
        'role': role
    }

@router.post('/refresh')
async def refresh(refresh_token: SessionCookie = None, aconn = Depends(get_db)):
    user_data = await validate_refresh_token(aconn, hash_token(refresh_token))
    if not refresh_token or not user_data:
        raise HTTPException(
            status_code=401,
            detail= "Missing or Broken refresh token cookie."
        )

    username = user_data['username']
    role = user_data['role']
    access_token = get_access_token(username, role)
      
    return{
            'access_token': access_token, 
            'username': username,
            'role': role
        }
