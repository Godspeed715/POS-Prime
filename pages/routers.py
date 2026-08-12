from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi import APIRouter, Request, Depends
from auth.utils import get_current_user

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

@router.get('/home')
async def home():
    return{
        'detail':'Welcome Home!'
    }


