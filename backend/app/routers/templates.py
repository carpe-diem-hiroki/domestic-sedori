"""テンプレート管理APIエンドポイント"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.order import Template

router = APIRouter(prefix="/api/templates", tags=["templates"])


# --- リクエスト/レスポンスモデル ---


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    body: str = Field(..., min_length=1, max_length=10000)


class TemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    body: str | None = Field(None, min_length=1, max_length=10000)


class TemplateResponse(BaseModel):
    id: int
    name: str
    body: str
    created_at: str


# --- エンドポイント ---


@router.get("/", response_model=list[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    """テンプレート一覧取得"""
    result = await db.execute(select(Template).order_by(Template.id))
    templates = result.scalars().all()
    return [
        TemplateResponse(
            id=t.id,
            name=t.name,
            body=t.body,
            created_at=t.created_at.isoformat(),
        )
        for t in templates
    ]


@router.post("/", response_model=TemplateResponse)
async def create_template(req: TemplateCreate, db: AsyncSession = Depends(get_db)):
    """テンプレート作成"""
    template = Template(name=req.name, body=req.body)
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return TemplateResponse(
        id=template.id,
        name=template.name,
        body=template.body,
        created_at=template.created_at.isoformat(),
    )


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """テンプレート詳細取得"""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateResponse(
        id=template.id,
        name=template.name,
        body=template.body,
        created_at=template.created_at.isoformat(),
    )


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: int, req: TemplateUpdate, db: AsyncSession = Depends(get_db)
):
    """テンプレート更新"""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if req.name is not None:
        template.name = req.name
    if req.body is not None:
        template.body = req.body

    await db.commit()
    await db.refresh(template)
    return TemplateResponse(
        id=template.id,
        name=template.name,
        body=template.body,
        created_at=template.created_at.isoformat(),
    )


@router.delete("/{template_id}")
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """テンプレート削除"""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    await db.delete(template)
    await db.commit()
    return {"detail": "Template deleted"}
