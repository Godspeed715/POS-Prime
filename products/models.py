from pydantic import BaseModel
from typing import Any

# Pydantic Models for Products
class CashoutModel(BaseModel):
    cart: list[dict]
    promo: int | None = None


# # 1. Define what a single item inside the cart looks like
# class CartItem(BaseModel):
#     item_id: int
#     quantity: int
#     price: float  # Or Decimal for currency safety

# # 2. Use it inside your main model
# class CashoutModel(BaseModel):
#     cart: dict[str, list[CartItem]]
#     promo: int | None = None
