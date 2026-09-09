from psycopg import AsyncConnection
from psycopg.rows import dict_row

# Later make transactions show users that made the transaction 
# Enable deleting transactions
# Enable transaction type
async def fetch_transactions_by_id(aconn: AsyncConnection, business_id: str):
    '''Fetches all transactions for that business'''
    async with aconn.transaction():
        async with aconn.cursor(row_factory=dict_row) as cur:
            await cur.execute('''
                SELECT t.id, t.user_id, u.username AS cashier_username, t.total_amount, t.created_at AS timestamp
                FROM transactions t
                JOIN users u ON (t.user_id=u.id)
                WHERE t.business_id=%s
            ''', (business_id,))
            return await cur.fetchall()