from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import auth_router, data_router, ml_router, dashboard_router, locations_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Coconut Demand Forecast API")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(data_router.router)
app.include_router(ml_router.router)
app.include_router(dashboard_router.router)
app.include_router(locations_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
