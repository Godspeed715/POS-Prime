from fastapi import APIRouter, Depends, HTTPException
from core.database import get_db
from core.dependencies import get_current_user
from schemas.checkout import CheckoutRequest
from queries.checkout import perform_transaction


router = APIRouter(tags=['Checkout'], prefix='/api')

@router.post('/checkout')
async def checkout(data: CheckoutRequest, aconn = Depends(get_db), user = Depends(get_current_user)):
    '''Performs a transaction'''
    total = sum([product['price']*product['quantity'] for product in data.cart])
    result = await perform_transaction(aconn, data.cart, total, user['username'], user['business_id'])

    if not result['success']:
        raise HTTPException(
            status_code=500,
            detail='Server Failed'
        )
    
    return{
        'detail':'Sucessful Transaction!'
    }
