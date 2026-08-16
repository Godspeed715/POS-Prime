from psycopg import AsyncConnection, Error
from psycopg.rows import dict_row

async def user_exists(aconn: AsyncConnection, username: str) -> bool:
    async with aconn.cursor() as cur:
        await cur.execute(
            "SELECT 1 FROM users WHERE username = %s LIMIT 1",
            (username,)
        )
        return await cur.fetchone() is not None


async def get_user_auth_data(aconn: AsyncConnection, username: str) -> dict | None:
    """Fetch password hash + role in one round trip (steps 2 & 3)."""
    async with aconn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id, username, password_hash, role FROM users WHERE username = %s",
            (username,)
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
            SELECT u.username, u.role
            FROM refresh_tokens rt
            JOIN users u ON u.id = rt.user_id
            WHERE rt.token_hash = %s AND rt.expires_at > now()
            """,
            (refresh_token,)
        )
        return await cur.fetchone()