import os
from dotenv import load_dotenv
load_dotenv()

# Safely Imports Environment Variables
DB_URI = os.environ.get('DB_URI')
SECRET_KEY = os.environ.get('SECRET_KEY')
ALGORITHM = os.environ.get('ALGORITHM')