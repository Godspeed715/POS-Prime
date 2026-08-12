from fastapi.testclient import TestClient
# from requests import Response
from main import app

client = TestClient(app)

def test_auth():
    request = {
        'username': 'roman',
        'password': 'pass'
    }
    response = client.post('/api/auth/login', json=request)
    assert response.status_code == 200

def test_cookies():
    request = {
        'username': 'roman',
        'password': 'pass'
    }
    response = client.post('/api/auth/login', json=request)
    assert response.cookies

def test_checkout():
    response = client.get('/api/products')
    assert response.status_code == 200
