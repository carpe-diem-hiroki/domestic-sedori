"""テスト用の共通フィクスチャ"""
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base


# --- テスト用インメモリDBセッション（個別テスト用） ---

@pytest_asyncio.fixture
async def db_session():
    """テスト用インメモリDBセッション"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# --- API統合テスト用：appのDB依存関係をオーバーライド ---

_test_engine = create_async_engine("sqlite+aiosqlite:///:memory:")
_test_session_factory = async_sessionmaker(
    _test_engine, class_=AsyncSession, expire_on_commit=False
)


async def _override_get_db():
    async with _test_session_factory() as session:
        yield session


@pytest.fixture(autouse=True, scope="session")
def _apply_db_override():
    """セッション開始時にappのget_db依存関係をテスト用DBにオーバーライド"""
    from app.main import app
    from app.database import get_db
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(autouse=True)
async def _setup_test_db():
    """各テスト前にテーブルを作成し、テスト後にドロップする（API統合テスト向け）"""
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
