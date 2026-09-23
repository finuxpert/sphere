"""Dedicated Rundeck infrastructure monitoring tables.

Revision ID: 20260923_0005
Revises: 20260916_0004
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision="20260923_0005"
down_revision="20260916_0004"
branch_labels=None
depends_on=None

def upgrade():
    op.create_table("rundeck_infra_collections",
        sa.Column("collection_id",sa.String(96),primary_key=True),
        sa.Column("execution_id",sa.String(40),nullable=False,unique=True),
        sa.Column("host",sa.String(120),nullable=False),
        sa.Column("status",sa.String(20),nullable=False),
        sa.Column("snapshot_ts",sa.DateTime(timezone=True),nullable=False),
        sa.Column("sample_seconds",sa.Float(),nullable=True),
        sa.Column("checksum_sha256",sa.String(64),nullable=True),
        sa.Column("raw_path",sa.Text(),nullable=True),
        sa.Column("size_bytes",sa.BigInteger(),nullable=False,server_default="0"),
        sa.Column("created_at",sa.DateTime(timezone=True),nullable=False))
    op.create_index("ix_rundeck_infra_collections_host_time","rundeck_infra_collections",["host","snapshot_ts"])
    op.create_table("rundeck_infra_filesystems",
        sa.Column("collection_id",sa.String(96),sa.ForeignKey("rundeck_infra_collections.collection_id",ondelete="CASCADE"),nullable=False),
        sa.Column("host",sa.String(120),nullable=False), sa.Column("collected_at",sa.DateTime(timezone=True),nullable=False),
        sa.Column("device",sa.String(255)), sa.Column("mount_point",sa.String(512),nullable=False),
        sa.Column("fstype",sa.String(64)), sa.Column("used_pct",sa.Float()), sa.Column("total_bytes",sa.BigInteger()),
        sa.Column("avail_bytes",sa.BigInteger()), sa.Column("is_primary",sa.Boolean(),nullable=False,server_default=sa.text("true")),
        sa.Column("details",postgresql.JSONB(astext_type=sa.Text()),nullable=False,server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("collection_id","host","mount_point",name="pk_rundeck_infra_filesystems"))
    op.create_index("ix_rundeck_infra_filesystems_host_time","rundeck_infra_filesystems",["host","collected_at"])
    op.create_table("rundeck_infra_samples",
        sa.Column("collection_id",sa.String(96),sa.ForeignKey("rundeck_infra_collections.collection_id",ondelete="CASCADE"),nullable=False),
        sa.Column("host",sa.String(120),nullable=False), sa.Column("collected_at",sa.DateTime(timezone=True),nullable=False),
        sa.Column("kind",sa.String(24),nullable=False), sa.Column("sample_key",sa.String(255),nullable=False),
        sa.Column("metrics",postgresql.JSONB(astext_type=sa.Text()),nullable=False,server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("collection_id","host","kind","sample_key",name="pk_rundeck_infra_samples"))
    op.create_index("ix_rundeck_infra_samples_kind_time","rundeck_infra_samples",["kind","host","collected_at"])

def downgrade():
    op.drop_table("rundeck_infra_samples")
    op.drop_table("rundeck_infra_filesystems")
    op.drop_table("rundeck_infra_collections")
