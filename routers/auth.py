from fastapi import APIRouter, HTTPException, Response, Cookie, Depends
from schemas.auth import LoginRequest, SignupRequest
from typing import Annotated
from core.database import get_db
from utils.auth import *
from queries.auth import *
from datetime import datetime, timedelta, timezone

  
router = APIRouter(prefix='/api/auth', tags=['Auth'])

SessionCookie = Annotated[str | None, Cookie(description="The active login session token")]

@router.post('/login')
async def login(request: LoginRequest, response: Response, aconn = Depends(get_db)):
    username = request.username
    password = request.password
    business_code = request.business_code
    if not await user_exists(aconn, username, business_code):
        raise HTTPException(
            status_code=401,
            detail= 'User Not Found.'
        )
    user_data = await get_user_auth_data(aconn, username, business_code)
    if  not await verify_password_async(password, user_data['password_hash']):
    # if  password!=user_data['password_hash']:  
        raise HTTPException(
            status_code=401,
            detail= 'Password Incorrect.'
        )
    
    role = user_data['role']
    business_id = user_data['business_id']
   
    access_token = get_access_token(username, role, business_id)
    refresh_token = get_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    await set_refresh_token(aconn, user_data['id'], hash_token(refresh_token), expires_at)
    response.delete_cookie(
        key="refresh_token",
        path="/api",          # must match what you set originally
        secure=True,
        samesite="lax"
    )
    response.set_cookie(
        key='refresh_token',
        value=refresh_token, 
        httponly=True, 
        secure=True,
        samesite='lax',
        path='/api',
        max_age=60*60*24 *7 #change 7 for the number of days
    )
    
    return{
        'access_token': access_token, 
        'username': user_data['username'],
        'role': role,
        'business_id': str(business_id)
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
    business_id = user_data['business_id']
    access_token = get_access_token(username, role, business_id)
      
    return{
            'access_token': access_token, 
            'username': username,
            'role': role,
            'business_id': business_id
        }

@router.get('/logout')
async def refresh(refresh_token: SessionCookie = None, aconn = Depends(get_db)):
    user_data = await validate_refresh_token(aconn, hash_token(refresh_token))
    if not refresh_token or not user_data:
        raise HTTPException(
            status_code=401,
            detail= "Missing or Broken refresh token cookie."
        )
    try:
        await revoke_refresh_token(aconn, hash_token(refresh_token))
        return{
            'status': 'ok'
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail='Logout Failed')

@router.post('/signup')
async def signup(request: SignupRequest, aconn = Depends(get_db)):
    if request.signup_type == 'owner':
        slug = get_slug(request.business_name)
        user_data = await create_owner(aconn, request.username, request.password, request.email, request.business_name, slug)
        return user_data
    elif request.signup_type == 'employee':
        user_data = await create_cashier(aconn, request.username, request.password, request.business_code, request.email)
        return user_data
    
@router.get('/hash/{password:str}')
async def hash(password: str):
    return await hash_password_async(password)