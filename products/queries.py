from psycopg import AsyncConnection, Error
from psycopg.rows import dict_row

async def search_item(aconn: AsyncConnection, item_name: str) -> list:
    '''Returns a list of products that contain the searched string'''

    item_name = f'%{item_name}%'

    async with aconn.cursor(row_factory=dict_row, ) as cur:
        await cur.execute('''
        SELECT id, name, price, category FROM products 
        WHERE name ILIKE %s
        ''', 
        (item_name,)
        )

        return await cur.fetchall()

async def fetch_all_products(aconn: AsyncConnection) -> list:
    '''Returns a list of all products available'''

    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute('''
            SELECT id, name, price, category, barcode FROM products 

        ''')
        return await cur.fetchall()


async def fetch_all_products_with_stock(aconn: AsyncConnection) -> list:
    '''Returns a list of all products available'''

    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute('''
            SELECT id, name, price, category, barcode, stock_quantity AS stock FROM products 

        ''')
        return await cur.fetchall()
    
async def fetch_all_stock(aconn: AsyncConnection) -> dict:
    '''Returns a list of all products available'''

    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute('SELECT id, stock_quantity FROM products')
        product_stocks = await cur.fetchall()

        # Uses a dictinary comprehension to put it in a format
        # e.g. {1:12, 2:3 }
        return {product['id']:product['stock_quantity'] for product in product_stocks}

async def perform_transaction(aconn: AsyncConnection, products: list[dict], total_amount: int):
    '''Performs a transaction and inserting it into the database'''
    try:
        # Used aconn.transaction() to implement automatic rollback and commits
        async with aconn.transaction():
            async with aconn.cursor(row_factory=dict_row) as cur:
                await cur.execute('''
                    INSERT INTO transactions(user_id, total_amount)
                    VALUES (%s, %s) RETURNING id
                    ''', ('01a00add-2b6b-7b48-ac33-4c86faa8fbd9', total_amount))
                
                transaction_id = (await cur.fetchone())['id']

                products_values = [(transaction_id, product['id'], product['quantity'], product['price']) for product in products]

                await cur.executemany('''
                    INSERT INTO transaction_items(transaction_id, product_id, quantity, recorded_price)
                    VALUES (%s, %s, %s, %s)
                    ''', products_values)
                
                products_values = [(product['quantity'], product['id']) for product in products]

                await cur.executemany('''
                    UPDATE products
                    SET stock_quantity = stock_quantity - %s
                    WHERE id = %s
                    ''', products_values)
                
                return{'success': True}
    except Error as e:
        return {'success': False}
