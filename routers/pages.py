from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi import APIRouter, Request

router = APIRouter(tags=['Pages'])
router.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory='templates')

@router.get("/")
async def pos_dashboard(request: Request):
    return templates.TemplateResponse(
        request=request, 
        name='pos.html',
    )

@router.get('/login')
async def login(request: Request):
    return templates.TemplateResponse(
        request=request,
        name='login.html',
    )

@router.get('/stock')
async def stock(request: Request):
    return templates.TemplateResponse(
        request=request,
        name='stock.html'
    )

@router.get('/home')
async def home():
    return{
        'detail':'Welcome Home!'
    }

@router.get('/signup')
async def signup(request: Request):
    return templates.TemplateResponse(
        request=request,
        name='signup.html'
    )

@router.get('/transactions')
async def transactions(request: Request):
    return templates.TemplateResponse(
        request=request,
        name='transactions.html'
    )

