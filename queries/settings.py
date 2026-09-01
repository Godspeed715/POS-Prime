from psycopg import AsyncConnection
from psycopg.rows import dict_row

async def fetch_business_code(aconn: AsyncConnection, business_id: str):
    '''Fetches the business_code using business_id'''
    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute('''
            SELECT slug AS business_code FROM business_listings
            WHERE id = %s
        '''
        , (business_id,))
        return await cur.fetchone()