#!/usr/bin/env python3
"""Strict, secret-safe validation of the local SPHERE DEV migration URL.

Reads a URL from stdin rather than argv so it is not exposed in process
arguments. Does not connect to the DB, alter a schema, or print the URL.
"""
from __future__ import annotations

import sys
from urllib.parse import parse_qsl, urlsplit

APPROVED_DATABASES = frozenset({"sphere_rundeck_dev", "sphere-rundeck-dev"})
LOCAL_SOCKETS = frozenset({"/var/run/postgresql", "/run/postgresql"})
LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def validate(url: str) -> bool:
    """Allow only the sphere role and an exact local DEV database target."""
    try:
        uri = urlsplit(url.strip())
        if uri.scheme not in {"postgresql+psycopg", "postgresql"}:
            return False
        if uri.username != "sphere" or uri.password is not None:
            return False
        if uri.path != "/sphere_rundeck_dev" and uri.path != "/sphere-rundeck-dev":
            return False
        if uri.fragment:
            return False

        items = parse_qsl(uri.query, keep_blank_values=True, strict_parsing=True)
        if uri.hostname is None:
            # The documented deployment uses PostgreSQL's local peer auth.
            # Never accept remote hosts through duplicated or unrelated args.
            return (
                uri.port is None
                and len(items) == 1
                and items[0][0] == "host"
                and items[0][1] in LOCAL_SOCKETS
            )

        # Support explicit loopback connections if configured in the future.
        return (
            uri.hostname in LOOPBACK_HOSTS
            and uri.port in {None, 5432}
            and not items
        )
    except (ValueError, TypeError):
        return False


def main() -> int:
    candidate = sys.stdin.read(8193)
    if len(candidate) > 8192 or not validate(candidate):
        print("DEV_DATABASE_TARGET=BLOCKED")
        return 2
    print("DEV_DATABASE_TARGET=EXACT_LOCAL_DEV_VERIFIED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
