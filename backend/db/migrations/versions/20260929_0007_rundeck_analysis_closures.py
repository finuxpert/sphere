"""Persist operator closing decisions for SAP performance reviews.

Revision ID: 20260929_0007
Revises: 20260923_0006
Create Date: 2026-09-29
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260929_0007"
down_revision = "20260923_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rundeck_analysis_closures",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("consumer_type", sa.String(length=16), nullable=False),
        sa.Column("consumer_key", sa.String(length=512), nullable=False),
        sa.Column("host", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("period_key", sa.String(length=16), nullable=False, server_default="1d"),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closing_status", sa.String(length=40), nullable=False),
        sa.Column("finding", sa.Text(), nullable=False, server_default=""),
        sa.Column("recommendation", sa.Text(), nullable=False, server_default=""),
        sa.Column("owner", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("follow_up", sa.Text(), nullable=False, server_default=""),
        sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint(
            "consumer_type", "consumer_key", "host", "period_key", "window_end",
            name="uq_rundeck_analysis_closure_window",
        ),
    )
    op.create_index(
        "ix_rundeck_analysis_closures_consumer",
        "rundeck_analysis_closures",
        ["consumer_type", "consumer_key", "closed_at"],
    )
    op.create_index(
        "ix_rundeck_analysis_closures_status",
        "rundeck_analysis_closures",
        ["closing_status", "closed_at"],
    )


def downgrade() -> None:
    op.drop_table("rundeck_analysis_closures")
