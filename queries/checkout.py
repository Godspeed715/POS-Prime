from psycopg.errors import Error
from psycopg import AsyncConnection
from decimal import Decimal
from psycopg.rows import dict_row

async def perform_transaction(aconn: AsyncConnection, products: list[dict], total_amount: Decimal, username: str, business_id: str):
    '''Performs a transaction and inserting it into the database'''
    try:
        # Used aconn.transaction() to implement automatic rollback and commits
        async with aconn.transaction():
            async with aconn.cursor(row_factory=dict_row) as cur:
                await cur.execute('''
                    SELECT id FROM users 
                    WHERE username = %s AND business_id = %s
                ''', (username, business_id))

                user_id = (await cur.fetchone())['id']
                 
                await cur.execute('''
                    INSERT INTO transactions(user_id, total_amount, business_id)
                    VALUES (%s, %s, %s) RETURNING id
                    ''', (user_id, total_amount, business_id))
                
                transaction_id = (await cur.fetchone())['id']

                products_values = [(transaction_id, product['id'], product['quantity'], product['price']) for product in products]

                await cur.executemany('''
                    INSERT INTO transaction_items(transaction_id, product_id, quantity, recorded_price)
                    VALUES (%s, %s, %s, %s)
                    ''', products_values)
                
                products_values = [(product['quantity'], product['id']) for product in products]

                await cur.executemany('''
                    UPDATE business_products
                    SET stock_quantity = stock_quantity - %s
                    WHERE id = %s
                    ''', products_values)
                
                return{'success': True}
    except Error as e:
        # raise e
        return {'success': False}