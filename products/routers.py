from fastapi import APIRouter, Depends, HTTPException
from products.models import CashoutModel
from core.database import get_db
from products.queries import fetch_all_products, fetch_all_stock, perform_transaction, fetch_all_products_with_stock
from auth.utils import get_current_user

router = APIRouter(tags=['Products'], prefix='/api')

@router.get('/products')
async def products(aconn = Depends(get_db), user = Depends(get_current_user)):
    '''Returns a list of alll the products'''
    results = await fetch_all_products(aconn)
    return results

@router.get('/products_with_stocks')
async def products(aconn = Depends(get_db), user = Depends(get_current_user)):
    '''Returns a list of alll the products'''
    results = await fetch_all_products_with_stock(aconn)
    return results

@router.get('/stock')
async def stock(aconn = Depends(get_db), user = Depends(get_current_user)):
    '''Returns a dictionary of all the stocks'''
    results = await fetch_all_stock(aconn)
    return results

@router.post('/checkout')
async def checkout(data: CashoutModel, aconn = Depends(get_db), user = Depends(get_current_user)):
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