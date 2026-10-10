from pathlib import Path

from pydantic_settings import BaseSettings

# Repo root is three levels up from this file (backend/app/config.py)
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    QDRANT_URL: str
    OPENAI_API_KEY: str
    OPENAI_CHAT_MODEL: str
    COHERE_API_KEY: str
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 20
    ALLOWED_EXTENSIONS: list[str] = ["pdf", "txt", "md", "docx"]
    TOP_K_RETRIEVAL: int = 5
    DENSE_SPARSE_FANOUT: int = 20         # candidates fetched per dense/sparse path before RRF
    RERANK_CANDIDATES_PER_PATH: int = 20  # candidates fetched per dense/sparse path
    RERANK_TOP_N: int = 20                # candidates sent to Cohere reranker
    RATE_LIMIT_QUERIES_PER_MINUTE: int = 20  # per org_id, fixed 60s window — see middleware/rate_limit.py

    class Config:
        env_file = str(_ENV_FILE)
        extra = "ignore"


settings = Settings()
