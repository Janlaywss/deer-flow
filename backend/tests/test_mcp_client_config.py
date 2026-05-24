"""Core behavior tests for MCP client server config building."""

import os

import pytest

from deerflow.config.extensions_config import ExtensionsConfig, McpServerConfig
from deerflow.mcp.client import build_server_params, build_servers_config


def _clear_stdio_inherited_env(monkeypatch):
    for key in tuple(os.environ):
        if key.startswith("UV_"):
            monkeypatch.delenv(key, raising=False)
    for key in (
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
    ):
        monkeypatch.delenv(key, raising=False)


def test_build_server_params_stdio_success(monkeypatch):
    _clear_stdio_inherited_env(monkeypatch)
    config = McpServerConfig(
        type="stdio",
        command="npx",
        args=["-y", "my-mcp-server"],
        env={"API_KEY": "secret"},
    )

    params = build_server_params("my-server", config)

    assert params == {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "my-mcp-server"],
        "env": {"API_KEY": "secret"},
    }


def test_build_server_params_stdio_inherits_uv_runtime_env(monkeypatch):
    _clear_stdio_inherited_env(monkeypatch)
    monkeypatch.setenv("UV_INDEX_URL", "https://mirror.example/simple")
    config = McpServerConfig(
        type="stdio",
        command="uvx",
        args=["mcp-server"],
        env={"API_KEY": "secret"},
    )

    params = build_server_params("uvx-server", config)

    assert params["env"] == {
        "UV_INDEX_URL": "https://mirror.example/simple",
        "API_KEY": "secret",
    }


def test_build_server_params_stdio_config_env_overrides_inherited_env(monkeypatch):
    _clear_stdio_inherited_env(monkeypatch)
    monkeypatch.setenv("UV_INDEX_URL", "https://runtime.example/simple")
    config = McpServerConfig(
        type="stdio",
        command="uvx",
        args=["mcp-server"],
        env={"UV_INDEX_URL": "https://config.example/simple"},
    )

    params = build_server_params("uvx-server", config)

    assert params["env"]["UV_INDEX_URL"] == "https://config.example/simple"


def test_build_server_params_stdio_omits_env_when_config_has_no_env(monkeypatch):
    _clear_stdio_inherited_env(monkeypatch)
    monkeypatch.setenv("UV_INDEX_URL", "https://mirror.example/simple")
    config = McpServerConfig(type="stdio", command="uvx", args=["mcp-server"])

    params = build_server_params("uvx-server", config)

    assert "env" not in params


def test_extensions_config_resolves_env_variables_inside_nested_collections(monkeypatch):
    monkeypatch.setenv("MCP_TOKEN", "secret")
    monkeypatch.delenv("MISSING_TOKEN", raising=False)
    raw_config = {
        "args": ["--token", "$MCP_TOKEN", {"nested": ["$MCP_TOKEN", "$MISSING_TOKEN"]}],
        "tuple_args": ("$MCP_TOKEN", "$MISSING_TOKEN"),
        "env": {"API_KEY": "$MCP_TOKEN"},
        "enabled": True,
        "timeout": 30,
    }

    resolved = ExtensionsConfig.resolve_env_variables(raw_config)

    assert resolved["args"] == ["--token", "secret", {"nested": ["secret", ""]}]
    assert resolved["tuple_args"] == ("secret", "")
    assert resolved["env"] == {"API_KEY": "secret"}
    assert resolved["enabled"] is True
    assert resolved["timeout"] == 30


def test_build_server_params_stdio_requires_command():
    config = McpServerConfig(type="stdio", command=None)

    with pytest.raises(ValueError, match="requires 'command' field"):
        build_server_params("broken-stdio", config)


@pytest.mark.parametrize("transport", ["sse", "http"])
def test_build_server_params_http_like_success(transport: str):
    config = McpServerConfig(
        type=transport,
        url="https://example.com/mcp",
        headers={"Authorization": "Bearer token"},
    )

    params = build_server_params("remote-server", config)

    assert params == {
        "transport": transport,
        "url": "https://example.com/mcp",
        "headers": {"Authorization": "Bearer token"},
    }


@pytest.mark.parametrize("transport", ["sse", "http"])
def test_build_server_params_http_like_requires_url(transport: str):
    config = McpServerConfig(type=transport, url=None)

    with pytest.raises(ValueError, match="requires 'url' field"):
        build_server_params("broken-remote", config)


def test_build_server_params_rejects_unsupported_transport():
    config = McpServerConfig(type="websocket")

    with pytest.raises(ValueError, match="unsupported transport type"):
        build_server_params("bad-transport", config)


def test_build_servers_config_returns_empty_when_no_enabled_servers():
    extensions = ExtensionsConfig(
        mcp_servers={
            "disabled-a": McpServerConfig(enabled=False, type="stdio", command="echo"),
            "disabled-b": McpServerConfig(enabled=False, type="http", url="https://example.com"),
        },
        skills={},
    )

    assert build_servers_config(extensions) == {}


def test_build_servers_config_skips_invalid_server_and_keeps_valid_ones():
    extensions = ExtensionsConfig(
        mcp_servers={
            "valid-stdio": McpServerConfig(enabled=True, type="stdio", command="npx", args=["server"]),
            "invalid-stdio": McpServerConfig(enabled=True, type="stdio", command=None),
            "disabled-http": McpServerConfig(enabled=False, type="http", url="https://disabled.example.com"),
        },
        skills={},
    )

    result = build_servers_config(extensions)

    assert "valid-stdio" in result
    assert result["valid-stdio"]["transport"] == "stdio"
    assert "invalid-stdio" not in result
    assert "disabled-http" not in result
