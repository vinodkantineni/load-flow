from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_db_and_tables
from app.routers.auth import router as auth_router
from app.routers.roles import router as roles_router
from app.routers.compliance import router as compliance_router
from app.routers.loads import router as loads_router
from app.routers.rate_confirmations import router as rate_confirmations_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and tables
    create_db_and_tables()
    yield

app = FastAPI(title="LoadFlow API", lifespan=lifespan)

# Setup CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers under /api
app.include_router(auth_router, prefix="/api")
app.include_router(roles_router, prefix="/api")
app.include_router(compliance_router, prefix="/api")
app.include_router(loads_router, prefix="/api")
app.include_router(rate_confirmations_router, prefix="/api")

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
