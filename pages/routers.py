from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi import APIRouter, Request

router = APIRouter(tags=['Pages'])
router.mount("/static", StaticFiles(directory="pages/static"), name="static")
templates = Jinja2Templates(directory='pages/templates')

@router.get("/")
async def pos_dashboard(request: Request):
    # Mock data to simulate database records
    categories = ['Cakes', 'Pastry', 'Ice Cream', 'Pancakes', 'Vegan']
    
    products = [
        {"id": 1, "name": "Raspberry Tart", "price": 8.12, "image": "https://images.unsplash.com/photo-1519869325930-281384150729?auto=format&fit=crop&w=200&q=80"},
        {"id": 2, "name": "Lemon Tart", "price": 2.86, "image": "https://images.unsplash.com/photo-1514326640560-7d063ef2aed5?auto=format&fit=crop&w=200&q=80"},
        {"id": 3, "name": "Chocolate Tart", "price": 6.12, "image": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=200&q=80"},
        {"id": 4, "name": "Fruit Tart", "price": 6.12, "image": "https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81?auto=format&fit=crop&w=200&q=80"},
        {"id": 5, "name": "Chocolate Cake", "price": 24.86, "image": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=200&q=80"},
        {"id": 6, "name": "Mini Chocolate Cake", "price": 6.12, "image": "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=200&q=80"}
    ]

    cart_items = [
        {"id": 1, "name": "Raspberry Tart", "price": 6.12, "quantity": 1, "image": "https://images.unsplash.com/photo-1519869325930-281384150729?auto=format&fit=crop&w=100&q=80"},
        {"id": 2, "name": "Lemon Tart", "price": 2.86, "quantity": 1, "image": "https://images.unsplash.com/photo-1514326640560-7d063ef2aed5?auto=format&fit=crop&w=100&q=80"}
    ]

    # 3. Return the TemplateResponse
    return templates.TemplateResponse(
        request=request, 
        name='pos.html',
        context={
            "request": request, # Required by FastAPI: You must pass the request object to the template
            "categories": categories, 
            "products": products, 
            "cart_items": cart_items
        }
    )
