from fastapi import APIRouter, Depends, HTTPException
from products.models import CashoutModel
from core.database import get_db
from products.queries import fetch_all_products, fetch_all_stock, perform_transaction, add_transaction_items

router = APIRouter(tags=['Products'], prefix='/api')

@router.get('/products')
async def products(aconn = Depends(get_db)):
    '''Returns a list of alll the products'''
    results = await fetch_all_products(aconn)
    return results

@router.get('/stock')
async def products(aconn = Depends(get_db)):
    '''Returns a dictionary of all the stocks'''
    results = await fetch_all_stock(aconn)
    return results

@router.post('/checkout')
async def checkout(data: CashoutModel, aconn = Depends(get_db)):
    '''Performs a transaction'''
    total = sum([product['price']*product['quantity'] for product in data.cart])
    result = await perform_transaction(aconn, data.cart, total)

    if not result['success']:
        raise HTTPException(
            status_code=500,
            detail='Server Failed'
        )
    
    return{
        'detail':'Sucessful Transaction!'
    }