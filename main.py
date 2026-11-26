import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from storage.connection import get_db_connection

from routers import auth, habits, categories, users, schedules, occurrences, goals

import logging
from logging import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv(override=False)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost,http://localhost:5173,http://127.0.0.1,http://127.0.0.1:5173",
)
allowed_origins = [o.strip().rstrip("/") for o in raw_origins.split(",") if o.strip()]

app = FastAPI(
    title="Habit Tracker API",
    version="1.0.0",
    docs_url=None if ENVIRONMENT == "production" else "/docs",
    redoc_url=None if ENVIRONMENT == "production" else "/redoc",
)

logger = logging.getLogger(__name__)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled server exception on %s %s",
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Something went wrong on our end😞. Please try again in a moment. "
        },
    )

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


cors_kwargs = {
    "allow_origins": allowed_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

if ENVIRONMENT != "production":
    cors_kwargs["allow_origin_regex"] = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

app.add_middleware(CORSMiddleware, **cors_kwargs)

app.include_router(auth.router)
app.include_router(habits.router)
app.include_router(categories.router, prefix="/categories", tags=["categories"])
app.include_router(users.router)
app.include_router(schedules.router)
app.include_router(occurrences.router)
app.include_router(goals.router)


@app.get("/")
def root():
    return {"message": "Habit Tracker Backend API is running!"}


@app.get("/health")
def health_check():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        return {"status": "ok", "database": "connected", "environment": ENVIRONMENT}
    except Exception:
        raise HTTPException(status_code=503, detail="Database connection unavailable")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=(ENVIRONMENT != "production"),
    )