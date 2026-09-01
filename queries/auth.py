from psycopg import AsyncConnection, Error
from psycopg.rows import dict_row
from utils.auth import hash_password_async

async def user_exists(aconn: AsyncConnection, username: str, business_code: str) -> bool:
    async with aconn.cursor() as cur:
        await cur.execute(
            '''
            SELECT 1 FROM users u
            JOIN business_listings b 
            ON (u.business_id=b.id)
            WHERE username = %s AND slug = %s  
            LIMIT 1''',
            (username,business_code)
        )
        return await cur.fetchone() is not None


async def get_user_auth_data(aconn: AsyncConnection, username: str, business_code: str) -> dict | None:
    """Fetch password hash + role in one round trip (steps 2 & 3)."""
    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
           '''SELECT u.id, u.username, u.password_hash, u.role, b.id AS business_id
            FROM users u
            JOIN business_listings b 
            ON (u.business_id=b.id)
            WHERE username = %s AND slug = %s  ''',
            (username,business_code)
        )
        return await cur.fetchone()


async def set_refresh_token(aconn: AsyncConnection, user_id: int, refresh_token: str, expires_at) -> None:
    async with aconn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE
                SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
            """,
            (user_id, refresh_token, expires_at)
        )


async def validate_refresh_token(aconn: AsyncConnection, refresh_token: str) -> dict | None:
    """Check token exists & not expired, return username + role (second function group)."""
    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT u.username, u.role, u.business_id
            FROM refresh_tokens rt
            JOIN users u ON u.id = rt.user_id
            WHERE rt.token_hash = %s AND rt.expires_at > now()
            """,
            (refresh_token,)
        )
        return await cur.fetchone()

async def revoke_refresh_token(aconn: AsyncConnection, refresh_token: str) -> dict | None:
    '''Deletes/Revokes the refresh token to Logout the user'''
    async with aconn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                DELETE FROM refresh_tokens 
                WHERE token_hash = %s
                """,
                (refresh_token,)
            )

async def create_owner(aconn, username: str, plain_password: str, email: str, business_name: str, slug: str):
    '''Creates a new owner user and its business'''
    password_hash = await hash_password_async(plain_password)
    async with aconn.transaction():
        async with aconn.cursor(row_factory=dict_row) as cur:
            await cur.execute('''
                INSERT INTO business_listings(name, slug)
                VALUES (%s, %s)
                RETURNING id
            ''', (business_name, slug))

            business_id = (await cur.fetchone())['id']

            await cur.execute(
                """
                INSERT INTO users (username, email, password_hash, business_id, role)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, username, role, business_id
                """,
                (username, email, password_hash, business_id, "admin")
            )
            return await cur.fetchone()

async def create_cashier(aconn: AsyncConnection, username: str, plain_password: str, business_code: str, email: str | None =None):
    '''Create a new cashier user according to its business_code'''
    password_hash = await hash_password_async(plain_password)
    async with aconn.transaction():
        async with aconn.cursor(row_factory=dict_row) as cur:
            await cur.execute('''
                SELECT id FROM business_listings
                WHERE slug=%s AND is_active=TRUE
            ''', (business_code,))

            business_id = (await cur.fetchone())['id']

            await cur.execute('''
                INSERT INTO users (username, email, password_hash, business_id, role)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, username, role, business_id
                ''',
                (username, email, password_hash, business_id, "cashier"))
            
            return await cur.fetchone()
