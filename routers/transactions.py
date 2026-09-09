from fastapi import APIRouter, Depends
from core.database import get_db
from core.dependencies import get_current_user
from queries.transactions import fetch_transactions_by_id

router = APIRouter(prefix='/api', tags=['Transaction'])

@router.get('/transactions')
async def get_transaction(aconn=Depends(get_db), user=Depends(get_current_user)):
    '''Returns all the transactions for that business'''
    return await fetch_transactions_by_id(aconn, user['business_id'])