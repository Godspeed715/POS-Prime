from pydantic import BaseModel

# Pydantic Models for Auth
class LoginRequest(BaseModel):
    username: str
    password: str   
    business_code: str

class SignupRequest(BaseModel):
    signup_type: str
    business_name : str | None = None
    business_code: str | None = None
    username: str
    email: str | None = None
    password: str
    


    

    