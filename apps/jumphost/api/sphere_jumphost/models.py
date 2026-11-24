"""Input schemas only; validation here does NOT authorize network access."""
from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

HOSTNAME_PATTERN = re.compile(
    r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$"
)
USERNAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]{0,31}\$?$")


def valid_host(value: str) -> str:
    """Syntax only; allowlist/port restrictions and DNS pinning are NOT implemented."""
    value = value.strip()
    if not value or len(value) > 253 or any(char.isspace() for char in value):
        raise ValueError("Invalid host")
    if "%" in value or "@" in value or "/" in value or "\\" in value:
        raise ValueError("Invalid host")
    try:
        ipaddress.ip_address(value)
        return value
    except ValueError:
        pass
    if not HOSTNAME_PATTERN.fullmatch(value):
        raise ValueError("Invalid host")
    return value


class SSHSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    host: str = Field(min_length=1, max_length=253)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(min_length=1, max_length=33)

    @field_validator("host")
    @classmethod
    def check_host(cls, value: str) -> str:
        return valid_host(value)

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("Invalid SSH username")
        return value


class BrowserSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    url: str = Field(min_length=8, max_length=2048)

    @field_validator("url")
    @classmethod
    def check_url(cls, value: str) -> str:
        parts = urlsplit(value)
        if parts.scheme.lower() not in {"http", "https"}:
            raise ValueError("URL must use http or https")
        if not parts.hostname or parts.username is not None or parts.password is not None:
            raise ValueError("Invalid URL host or credentials")
        try:
            if parts.port is not None and not (1 <= parts.port <= 65535):
                raise ValueError("Invalid URL port")
        except ValueError as error:
            raise ValueError("Invalid URL port") from error
        valid_host(parts.hostname)
        return value
