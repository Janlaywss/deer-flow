import logging
import os
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class KnowledgeBaseConfig:
    """Configuration for Viking Knowledge Base MCP Server."""
    ak: str
    sk: str
    project: Optional[str] = None
    region: str = "cn-north-1"


def load_config() -> KnowledgeBaseConfig:
    """Load configuration from environment variables."""
    ak = _first_env(
        "VOLCENGINE_ACCESS_KEY",
        "VIKINGDB_ACCESS_KEY_ID",
        "VOLCENGINE_ACCESS_KEY_ID",
        "VOLCENGINE_AK",
    )
    sk = _first_env(
        "VOLCENGINE_SECRET_KEY",
        "VIKINGDB_SECRET_ACCESS_KEY",
        "VOLCENGINE_SECRET_ACCESS_KEY",
        "VOLCENGINE_SK",
    )

    missing_vars = []
    if not ak:
        missing_vars.append("VOLCENGINE_ACCESS_KEY or VIKINGDB_ACCESS_KEY_ID")
    if not sk:
        missing_vars.append("VOLCENGINE_SECRET_KEY or VIKINGDB_SECRET_ACCESS_KEY")
    if missing_vars:
        error_msg = f"Missing required environment variables: {', '.join(missing_vars)}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    return KnowledgeBaseConfig(
        ak=ak,
        sk=sk,
        project=_first_env("KNOWLEDGE_BASE_PROJECT", "VIKINGDB_PROJECT", default="default"),
        region=_first_env("KNOWLEDGE_BASE_REGION", default="cn-north-1"),
    )


def _first_env(*names: str, default: Optional[str] = None) -> Optional[str]:
    for name in names:
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip()
    return default


config = load_config()
