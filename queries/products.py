from psycopg import AsyncConnection, Error
from psycopg.rows import dict_row
from decimal import Decimal
from utils.products import remove_custom_placeholders



async def search_item(aconn: AsyncConnection, item_name: str) -> list:
    '''Returns a list of products that contain the searched string'''

    item_name = f'%{item_name}%'

    async with aconn.cursor(row_factory=dict_row, ) as cur:
        await cur.execute('''
        SELECT id, name, price, category FROM products 
        WHERE name ILIKE %s
        ''', (item_name,))

        return await cur.fetchall()

async def fetch_all_products(aconn: AsyncConnection, business_id: str) -> list:
    '''Returns a list of all products available'''

    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute('''
            SELECT m.id AS master_product_id, b.id AS business_product_id, m.name, m.category, b.price, m.barcode, b.custom_name, b.custom_category 
            FROM business_products b
            JOIN master_products m
            ON (b.master_product_id=m.id)
            WHERE b.is_active=TRUE AND b.business_id = %s
        ''', (business_id,))

        return  remove_custom_placeholders(await cur.fetchall())


async def fetch_all_products_with_stock(aconn: AsyncConnection, business_id: str) -> list:
    '''Returns a list of all products available'''

    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute('''
            SELECT m.id AS id, b.id AS business_product_id, m.name, m.category, b.price, m.barcode, b.custom_name, b.custom_category, b.stock_quantity AS stock 
            FROM business_products b
            JOIN master_products m
            ON (b.master_product_id=m.id)
            WHERE b.is_active=TRUE AND b.business_id = %s
        ''', (business_id,))

        return  remove_custom_placeholders(await cur.fetchall())
    
async def fetch_all_stock(aconn: AsyncConnection, business_id: str) -> dict:
    '''Returns a list of all products available'''

    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute('''
        SELECT b.id AS business_product_id, b.stock_quantity AS stock_quantity
        FROM business_products b
        WHERE b.is_active=TRUE AND b.business_id=%s
        ''', (business_id,))
        product_stocks = await cur.fetchall()

        # Uses a dictinary comprehension to put it in a format
        # e.g. {1:12, 2:3 }
        return {str(product['business_product_id']):product['stock_quantity'] for product in product_stocks}



async def fetch_prodcut_by_barcode(aconn: AsyncConnection, barcode: str):
    '''Finds a product accoring to its barcode'''
    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute('''
            SELECT id AS master_product_id, name, category
            FROM master_products
            WHERE barcode = %s
        ''', (barcode,))
        return await cur.fetchone()

async def add_to_products_table(aconn: AsyncConnection, business_id: str, master_product_id: str, price: Decimal, stock_quantity: int, custom_name: str | None = None, custom_category: str | None = None):
    '''Adds a product to the business_products table'''
    # Used aconn.transaction() to implement automatic rollback and commits
    async with aconn.transaction():
        async with aconn.cursor(row_factory=dict_row) as cur:
            await cur.execute('''
                INSERT INTO business_products(business_id, master_product_id, custom_name, custom_category, price, stock_quantity)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING master_product_id, id as business_product_id, custom_name, custom_category, price, stock_quantity
            ''', (business_id, master_product_id, custom_name, custom_category, price, stock_quantity))

        return await cur.fetchone()

async def add_to_master_table(aconn: AsyncConnection, name: str, category: str, barcode: str):
    '''Adds a product to the master_products table'''
    # Used aconn.transaction() to implement automatic rollback and commits
    async with aconn.transaction():
        async with aconn.cursor(row_factory=dict_row) as cur:
            await cur.execute('''
                INSERT INTO business_products(name, category, barcode)
                VALUES (%s, %s, %s)
                RETURNING id
            ''', (name, category, barcode))

        return await cur.fetchone()

async def modify_product_by_id(aconn: AsyncConnection, master_product_id: str, business_id: str, price: Decimal, stock_quantity: int, custom_name: str | None = None, custom_category: str | None = None):
    '''Modifies a product using its master product id and the business id'''
    # Used aconn.transaction() to implement automatic rollback and commits
    async with aconn.transaction():
        async with aconn.cursor() as cur:
            await cur.execute('''
                UPDATE business_products
                SET price = %s, 
                    stock_quantity = %s, 
                    custom_name = %s,
                    custom_category = %s
                WHERE master_product_id = %s AND business_id = %s
                RETURNING 1
            ''', (price, stock_quantity, custom_name, custom_category, master_product_id, business_id))
            return await cur.fetchone()

async def delete_product_by_id(aconn: AsyncConnection, master_product_id: str, business_id: str):
    '''Deletes a product using its master product id and the business id'''
    # Used aconn.transaction() to implement automatic rollback and commits
    async with aconn.transaction():
        async with aconn.cursor() as cur:
            await cur.execute('''
                UPDATE business_products
                SET is_active=FALSE
                WHERE master_product_id = %s AND business_id = %s
                RETURNING 1
            ''', (master_product_id, business_id))
            return await cur.fetchone()