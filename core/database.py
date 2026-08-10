from psycopg_pool import AsyncConnectionPool
from core.settings import DB_URI

# Creats an Async Connection Pool to the Database
# Pool is set to close
pool = AsyncConnectionPool(
    conninfo=DB_URI,
    min_size=2,
    max_size=10,
    open=False,
)

async def get_db():
    '''Yields a single database connection from the pool. (Pool Generator)'''
    async with pool.connection() as aconn:
        yield aconn

