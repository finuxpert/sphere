"""Store authoritative SAP background job execution observations.

Revision ID: 20260916_0004
Revises: 20260915_0003
Create Date: 2026-09-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260916_0004"
down_revision = "20260915_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sap_job_executions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="SM37"),
        sa.Column("client", sa.String(length=8), nullable=True),
        sa.Column("job_name", sa.String(length=255), nullable=False),
        sa.Column("job_count", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("step_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("program", sa.String(length=255), nullable=True),
        sa.Column("variant", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("scheduled_by", sa.String(length=64), nullable=True),
        sa.Column("server", sa.String(length=120), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.UniqueConstraint("source", "job_name", "job_count", "step_no", name="uq_sap_job_execution_identity"),
    )
    op.create_index("ix_sap_job_executions_started", "sap_job_executions", ["started_at"])
    op.create_index("ix_sap_job_executions_name_started", "sap_job_executions", ["job_name", "started_at"])
    op.create_index("ix_sap_job_executions_program_started", "sap_job_executions", ["program", "started_at"])
    op.create_index("ix_sap_job_executions_status_started", "sap_job_executions", ["status", "started_at"])
    op.create_index("ix_sap_job_executions_server_started", "sap_job_executions", ["server", "started_at"])


def downgrade() -> None:
    op.drop_table("sap_job_executions")
