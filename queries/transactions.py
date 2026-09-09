from psycopg import AsyncConnection

# Later make transactions show users that made the transaction 
# Enable deleting transactions
# Enable transaction type
async def fetch_transactions_by_id(aconn: AsyncConnection, business_id: str):
    '''Fetches all transactions for that business'''
    async with aconn.transaction():
        async with aconn.cursor() as cur:
            cur.execute('''
                SELECT t.id, t.user_id, u.username, t.total_amount, t.created_at
                FROM transactions t
                JOIN users u ON (t.user_id=u.id)
                WHERE business_id=%s
            ''', (business_id,))
            return cur.fetchall()