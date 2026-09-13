from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    supabase_jwt_secret: str
    groq_api_key: str
    hf_api_key: str = ""

    groq_model: str = "llama-3.3-70b-versatile"
    cors_origins: str = "http://localhost:5173"
    cors_origin_regex: str | None = None
    sec_edgar_user_agent: str = "ai-portfolio-tracker contact@example.com"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
