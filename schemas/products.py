from pydantic import BaseModel
from decimal import Decimal

# Pydantic Models for Products
class CheckoutRequest(BaseModel):
    cart: list[dict]
    promo: int | None = None

class AddProductRequest(BaseModel):
    barcode: str
    name: str
    category: str
    price: Decimal
    stock_quantity: int 

class ModifyProductRequest(BaseModel):
    price: Decimal
    stock_quantity: int
    custom_name: str | None = None
    custom_category: str | None = None

class BarcodeRequest(BaseModel):
    barcode: str
