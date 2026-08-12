from fastapi import FastAPI
from pages.routers import router as pages_router
from products.routers import router as products_router
from core.database import pool
from auth.routers import router as auth_router
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
