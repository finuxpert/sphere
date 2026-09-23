"""Allow one Rundeck infrastructure execution to persist multiple hosts.

Revision ID: 20260923_0006
Revises: 20260923_0005
"""
from alembic import op

revision="20260923_0006"
down_revision="20260923_0005"
branch_labels=None
depends_on=None

def upgrade():
    op.drop_constraint("rundeck_infra_collections_execution_id_key","rundeck_infra_collections",type_="unique")
    op.create_index("ix_rundeck_infra_collections_execution_id","rundeck_infra_collections",["execution_id"],unique=False)

def downgrade():
    op.drop_index("ix_rundeck_infra_collections_execution_id",table_name="rundeck_infra_collections")
    op.create_unique_constraint("rundeck_infra_collections_execution_id_key","rundeck_infra_collections",["execution_id"])
