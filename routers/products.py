from fastapi import APIRouter, Depends, HTTPException
from schemas.products import *
from core.database import get_db
from queries.products import *
from core.dependencies import get_current_user
from utils.products import remove_custom_placeholder

router = APIRouter(tags=['Products'], prefix='/api')


@router.get('/products')
async def products(aconn = Depends(get_db), user = Depends(get_current_user)):
    """Returns a list of all products for the authenticated business."""
    return  await fetch_all_products(aconn, user['business_id'])

@router.post('/products')
async def add_product(request: AddProductRequest,aconn = Depends(get_db), user = Depends(get_current_user)):
    '''Adds a product to the database in the master and business product tables'''
    product_exists = await fetch_prodcut_by_barcode(aconn, request.barcode)
    
    if product_exists is None:
        master_product_id = await add_to_master_table(aconn, request.name, request.category, request.barcode)
    else: 
        master_product_id = product_exists['master_product_id']

    price = request.price
    stock = request.stock_quantity
    custom_name = request.name if request.name != product_exists.get('name') else None
    custom_category = request.category if request.category != product_exists.get('category') else None

    response = await add_to_products_table(aconn, user['business_id'], master_product_id, price, stock, custom_name, custom_category)
    response['name'] = product_exists.get('name')
    response['category'] = product_exists.get('category')
    response['barcode'] = product_exists.get('barcode')

    return remove_custom_placeholder(response)

@router.put('/products/{business_product_id}')
async def modify_product(business_product_id: str, request: ModifyProductRequest, aconn = Depends(get_db), user = Depends(get_current_user)):
    '''Deletes a product'''
    price = request.price
    custom_name = request.custom_name
    custom_category = request.custom_category
    stock_quantity = request.stock_quantity
    response = await modify_product_by_id(aconn, business_product_id, price, stock_quantity, custom_name, custom_category)
    if response:
        return  response
    else:
        raise HTTPException(status_code=204, detail='Product ID was not found.')

@router.delete('/products/{business_product_id}')
async def modify_product(business_product_id: str, aconn = Depends(get_db), user = Depends(get_current_user)):
    '''Deletes a Product'''
    response = await delete_product_by_id(aconn, business_product_id, user['business_id'])
    if response:
        return  response
    else:
        raise HTTPException(status_code=204, detail='Product ID was not found.')
    

@router.get('/products_with_stocks')
async def products_with_stocks(aconn = Depends(get_db), user = Depends(get_current_user)):
    """Returns a list of all products with their stock levels."""
    return await fetch_all_products_with_stock(aconn, user['business_id'])


@router.get('/stock')
async def stock(aconn = Depends(get_db), user = Depends(get_current_user)):
    """Returns stock levels for the authenticated business."""

    return await fetch_all_stock(aconn, user['business_id'])

@router.post('/products/check-barcode')
async def check_barcode(request: BarcodeRequest, aconn = Depends(get_db), user = Depends(get_current_user)):
    '''Returns a product's details according to its barcode'''
    product = await fetch_prodcut_by_barcode(aconn, request.barcode)
    if product:
        product['found'] = True
        return product
    else:
        return {'found': False}


