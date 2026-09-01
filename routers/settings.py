from fastapi import APIRouter, Depends
from utils.auth import get_current_user
from core.database import get_db
from queries.settings import fetch_business_code

router = APIRouter(prefix='/api/settings', tags=['Setting'])

@router.get('/me')
async def get_business_code(user = Depends(get_current_user), aconn = Depends(get_db)):
    return await fetch_business_code(aconn, user['business_id'])