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

                transaction_id = await add_transaction(aconn, total_amount)

                # Use list comprehension to arrange products into a format list[tuple]
                products = [(transaction_id, product['id'], product['quantity'], product['price']) for product in products]

                await add_transaction_items(aconn, products)

                return{'success': True}
    except Error as e:
        return {'success': False}

async def add_transaction_items(aconn: AsyncConnection, products: list[tuple]):
    '''Inserts individual items in a transaction to the database'''
    async with aconn.cursor(row_factory=dict_row) as cur:
        try:
            await cur.executemany('''
            INSERT INTO transaction_items(transaction_id, product_id, quantity, recorded_price)
            VALUES (%s, %s, %s, %s)

            ''', products)
        except Error as e:
            raise Error('Adding transaction items failed') from e

async def add_transaction(aconn: AsyncConnection, total_amount: int):
    '''Inserts a transaction to the database'''
    try:
        async with aconn.cursor(row_factory=dict_row) as cur:
            await cur.execute('''
                    INSERT INTO transactions(user_id, total_amount)
                    VALUES (%s, %s) RETURNING id
                    ''', (1, total_amount))
            transaction_data = await cur.fetchone()
            return transaction_data['id']
    except Error as e:
            raise Error('Adding transaction failed') from e

# single_query = """
# WITH inserted_transaction AS (
#     INSERT INTO transactions (user_id, status) 
#     VALUES (%s, 'pending') 
#     RETURNING id
# )
# INSERT INTO products (transaction_id, name, price)
# SELECT inserted_transaction.id, unnested.name, unnested.price
# FROM inserted_transaction
# CROSS JOIN UNNEST(%s::text[], %s::numeric[]) AS unnested(name, price)
# RETURNING id, transaction_id;
# """