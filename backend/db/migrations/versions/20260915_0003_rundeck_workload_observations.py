"""Retain all observed SAP Job/Program workload rows.

Revision ID: 20260915_0003
Revises: 20260910_0002
Create Date: 2026-09-15
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260915_0003"
down_revision = "20260910_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rundeck_workload_observations",
        sa.Column(
            "collection_id",
            sa.String(length=96),
            sa.ForeignKey("rundeck_collections.collection_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("host", sa.String(length=120), nullable=False),
        sa.Column("consumer_type", sa.String(length=32), nullable=False),
        sa.Column("consumer_key", sa.String(length=255), nullable=False),
        sa.Column("cpu_pct", sa.Float(), nullable=True),
        sa.Column("ram_pct", sa.Float(), nullable=True),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.PrimaryKeyConstraint(
            "collection_id",
            "host",
            "collected_at",
            "consumer_type",
            "consumer_key",
            name="pk_rundeck_workload_observations",
        ),
    )
    op.create_index(
        "ix_rundeck_workload_observations_key_time",
        "rundeck_workload_observations",
        ["consumer_type", "consumer_key", "collected_at"],
    )
    op.create_index(
        "ix_rundeck_workload_observations_host_time",
        "rundeck_workload_observations",
        ["host", "collected_at"],
    )
    op.create_index(
        "ix_rundeck_workload_observations_time",
        "rundeck_workload_observations",
        ["collected_at"],
    )


def downgrade() -> None:
    op.drop_table("rundeck_workload_observations")
