from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# repo root: backend/app/config.py → parents[2]
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROJECT = REPO_ROOT / "sample-data" / "projects" / "party-customer-wave1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / "backend" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./migrate.db"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "demo-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12

    # Active sample project (all demo data lives under sample-data/projects/<id>/)
    sample_project_id: str = "party-customer-wave1"
    sample_projects_root: str = str(REPO_ROOT / "sample-data" / "projects")
    sample_legacy_path: str = str(DEFAULT_PROJECT / "legacy")
    migration_repo_path: str = str(DEFAULT_PROJECT / "migration-repo")

    gcs_endpoint: str = "http://localhost:9000"
    gcs_access_key: str = "minioadmin"
    gcs_secret_key: str = "minioadmin"
    llm_mode: str = "mock"  # mock | openai
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    # Live discovery agents (Cursor SDK) — required for Start discovery
    cursor_api_key: str = ""
    cursor_model: str = "composer-2.5"
    discovery_require_cursor: bool = True
    # When true (or LLM_MODE=openai), mobilisation Ready requires a successful hub probe
    require_hub_probe: bool = False
    usage_observation_days: int = 90
    reconcile_tolerance_pct: float = 0.1
    archive_retention_years: int = 7

    def project_dir(self) -> Path:
        return Path(self.sample_projects_root) / self.sample_project_id


@lru_cache
def get_settings() -> Settings:
    return Settings()
