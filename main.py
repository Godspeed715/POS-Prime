from fastapi import FastAPI
from routers.pages import router as pages_router
from routers.products import router as products_router
from core.database import pool
from routers.auth import router as auth_router
from routers.settings import router as settings_router
from routers.checkout import router as checkout_router
from contextlib import asynccontextmanager

# Async Context Manager to startup and close connection pool
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run at startup
    await pool.open()
    yield
    # Run at shutdown
    await pool.close()

# FastAPI app with the context manager implemented
app = FastAPI(lifespan=lifespan)

# Additional Routes
app.include_router(products_router)
app.include_router(pages_router)
app.include_router(auth_router)
app.include_router(settings_router)
app.include_router(checkout_router)
