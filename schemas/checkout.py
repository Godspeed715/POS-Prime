from pydantic import BaseModel

# Pydantic Models for Checkout
class CheckoutRequest(BaseModel):
    cart: list[dict]
    promo: int | None = None