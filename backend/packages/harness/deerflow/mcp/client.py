"""MCP client using langchain-mcp-adapters."""

import logging
import os
from typing import Any

from deerflow.config.extensions_config import ExtensionsConfig, McpServerConfig

logger = logging.getLogger(__name__)

MCP_STDIO_ENV_INHERIT_PREFIXES = ("UV_",)
MCP_STDIO_ENV_INHERIT_NAMES = {
    "ALL_PROXY",
    "CURL_CA_BUNDLE",
    "HOME",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "LANG",
    "LC_ALL",
    "NO_PROXY",
    "PATH",
    "REQUESTS_CA_BUNDLE",
    "SHELL",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USER",
    "all_proxy",
    "http_proxy",
    "https_proxy",
    "no_proxy",
}


def _build_stdio_env(config_env: dict[str, str]) -> dict[str, str]:
    """Build a constrained environment for stdio MCP child processes.

    Stdio MCP launchers such as uvx often need package-index, proxy, and
    certificate variables from the gateway runtime. When an MCP config provides
    any explicit env mapping, langchain-mcp-adapters treats it as the child
    process env, so keep the inheritance limited to runtime plumbing and let the
    MCP config override it.
    """
    env = {key: value for key, value in os.environ.items() if key in MCP_STDIO_ENV_INHERIT_NAMES or key.startswith(MCP_STDIO_ENV_INHERIT_PREFIXES)}
    env.update(config_env)
    return env


def build_server_params(server_name: str, config: McpServerConfig) -> dict[str, Any]:
    """Build server parameters for MultiServerMCPClient.

    Args:
        server_name: Name of the MCP server.
        config: Configuration for the MCP server.

    Returns:
        Dictionary of server parameters for langchain-mcp-adapters.
    """
    transport_type = config.type or "stdio"
    params: dict[str, Any] = {"transport": transport_type}

    if transport_type == "stdio":
        if not config.command:
            raise ValueError(f"MCP server '{server_name}' with stdio transport requires 'command' field")
        params["command"] = config.command
        params["args"] = config.args
        # Add environment variables if present
        if config.env:
            params["env"] = _build_stdio_env(config.env)
    elif transport_type in ("sse", "http"):
        if not config.url:
            raise ValueError(f"MCP server '{server_name}' with {transport_type} transport requires 'url' field")
        params["url"] = config.url
        # Add headers if present
        if config.headers:
            params["headers"] = config.headers
    else:
        raise ValueError(f"MCP server '{server_name}' has unsupported transport type: {transport_type}")

    return params


def build_servers_config(extensions_config: ExtensionsConfig) -> dict[str, dict[str, Any]]:
    """Build servers configuration for MultiServerMCPClient.

    Args:
        extensions_config: Extensions configuration containing all MCP servers.

    Returns:
        Dictionary mapping server names to their parameters.
    """
    enabled_servers = extensions_config.get_enabled_mcp_servers()

    if not enabled_servers:
        logger.info("No enabled MCP servers found")
        return {}

    servers_config = {}
    for server_name, server_config in enabled_servers.items():
        try:
            servers_config[server_name] = build_server_params(server_name, server_config)
            logger.info(f"Configured MCP server: {server_name}")
        except Exception as e:
            logger.error(f"Failed to configure MCP server '{server_name}': {e}")

    return servers_config
