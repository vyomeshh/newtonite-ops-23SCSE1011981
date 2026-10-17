"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://newtonite:newtonite_secret_2024@db:5432/newtonite_ops"
    DATABASE_URL_SYNC: str = "postgresql://newtonite:newtonite_secret_2024@db:5432/newtonite_ops"
    SECRET_KEY: str = "super-secret-key-change-in-production-newtonite-ops-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    class Config:
        env_file = ".env"


settings = Settings()
