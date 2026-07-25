from pathlib import Path

from pydantic_settings import BaseSettings

# Repo root is three levels up from this file (backend/app/config.py)
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    QDRANT_URL: str
    OPENAI_API_KEY: str

    class Config:
        env_file = str(_ENV_FILE)


settings = Settings()
