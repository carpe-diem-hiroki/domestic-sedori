from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./sedori.db"
    yahoo_scrape_interval_seconds: int = 600
    yahoo_request_delay_min: int = 3
    yahoo_request_delay_max: int = 8
    # Amazon
    amazon_request_delay_min: int = 3
    amazon_request_delay_max: int = 8
    # Scheduler
    scheduler_interval_minutes: int = 10
    scheduler_auto_start: bool = False
    # Amazon価格リフレッシュ（スケジューラー）
    amazon_refresh_enabled: bool = True
    amazon_refresh_interval_hours: int = 12  # この時間より古い価格だけ再取得
    # 価格差「仕入れチャンス」検出の閾値
    chance_min_profit_rate: float = 15.0   # 利益率（%）以上で通知
    chance_min_profit_amount: int = 1000   # かつ利益額（円）以上で通知
    chance_default_shipping: int = 800     # 利益計算に使う送料
    # Notification
    max_notifications: int = 100
    # General
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,https://www.amazon.co.jp,https://page.auctions.yahoo.co.jp,https://auctions.yahoo.co.jp"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


settings = Settings()
