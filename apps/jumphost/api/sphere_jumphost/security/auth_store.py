"""Small, single-admin local authentication store for the DEV scaffold.

Not a replacement for corporate SSO/MFA, privileged access management, or
production identity assurance. Uses SQLite for durable login/session state.
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from hashlib import pbkdf2_hmac, sha256
import hmac
import os
from pathlib import Path
import secrets
import sqlite3
import time

HASH_ITERATIONS = 600_000
SESSION_TTL_SECONDS = 8 * 60 * 60
LOCKOUT_SECONDS = 15 * 60
MAX_FAILURES = 5
COOKIE_NAME = "sphere_jumphost_session"
COOKIE_PATH = "/remote"  # Legacy/default production path; do not hard-code for DEV.


def get_cookie_path() -> str:
    path = os.getenv("JUMPHOST_PUBLIC_BASE_PATH", COOKIE_PATH).rstrip("/")
    if path not in {"/remote", "/dev/remote"}:
        raise ValueError("JUMPHOST_PUBLIC_BASE_PATH must be /remote or /dev/remote")
    return path


@dataclass(frozen=True)
class AuthSettings:
    environment: str
    db_path: Path
    allow_insecure_dev_bootstrap: bool
    secure_cookie: bool

    @classmethod
    def from_env(cls) -> "AuthSettings":
        environment = os.getenv("JUMPHOST_ENV", "prod").strip().lower()
        if environment not in {"dev", "prod"}:
            raise ValueError("JUMPHOST_ENV must be dev or prod")
        bootstrap = os.getenv("JUMPHOST_DEV_BOOTSTRAP_ADMIN_ADMIN", "0") == "1"
        if bootstrap and environment != "dev":
            raise ValueError("admin/admin bootstrap is allowed only in DEV")
        secure_cookie = os.getenv("JUMPHOST_COOKIE_SECURE", "1") == "1"
        if not secure_cookie and environment != "dev":
            raise ValueError("Insecure session cookies cannot be enabled in PROD")
        default_db = f"/var/lib/sphere-jumphost-{environment}/auth.sqlite3"
        db_path = Path(os.getenv("JUMPHOST_AUTH_DB", default_db)).expanduser()
        if not db_path.is_absolute():
            raise ValueError("JUMPHOST_AUTH_DB must be an absolute path")
        return cls(environment, db_path, bootstrap, secure_cookie)


@dataclass(frozen=True)
class Principal:
    username: str
    must_change_password: bool
    csrf_token: str
    token_digest: str


def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, HASH_ITERATIONS)
    return f"pbkdf2_sha256${HASH_ITERATIONS}${salt.hex()}${dk.hex()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt_hex, digest = encoded.split("$")
        if algorithm != "pbkdf2_sha256" or int(rounds) < HASH_ITERATIONS:
            return False
        candidate = pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(candidate, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False


def _validate_new_password(new: str) -> None:
    if not 12 <= len(new) <= 256 or new.lower() in {"admin", "admin123", "password", "password123"}:
        raise ValueError("Password baru minimal 12 karakter dan tidak boleh password umum")
    if not any(c.isalpha() for c in new) or not any(c.isdigit() for c in new):
        raise ValueError("Password baru perlu kombinasi huruf dan angka")


class LoginDenied(Exception):
    """Invalid or unavailable account (generic response prevents enumeration)."""


class LoginLocked(Exception):
    """Rate limit reached; locked temporarily."""


class AuthStore:
    def __init__(self, settings: AuthSettings):
        self.settings = settings
        self.db_path = settings.db_path
        self.db_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.db_path.is_symlink():
            raise RuntimeError("Auth database symlink is forbidden")
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS accounts (
                    username TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
                    must_change_password INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_digest TEXT PRIMARY KEY, username TEXT NOT NULL,
                    csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL,
                    FOREIGN KEY(username) REFERENCES accounts(username)
                );
                CREATE TABLE IF NOT EXISTS login_failures (
                    username TEXT PRIMARY KEY, attempts INTEGER NOT NULL,
                    last_failed_at INTEGER NOT NULL, locked_until INTEGER NOT NULL
                );
            """)
            if settings.allow_insecure_dev_bootstrap:
                # Explicit, opt-in DEV-only credentials. NEVER seed PROD with admin/admin.
                db.execute(
                    "INSERT OR IGNORE INTO accounts(username,password_hash,must_change_password) VALUES(?,?,1)",
                    ("admin", _password_hash("admin")),
                )
        os.chmod(self.db_path, 0o600)

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(str(self.db_path), timeout=10)
        db.execute("PRAGMA foreign_keys=ON")
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def provision_admin(self, password: str) -> None:
        """Admin provisioning for PROD by interactive CLI; never store plaintext."""
        _validate_new_password(password)
        with self._connect() as db:
            if db.execute("SELECT 1 FROM accounts WHERE username='admin'").fetchone():
                raise ValueError("Admin already exists; do not overwrite account")
            db.execute("INSERT INTO accounts VALUES(?,?,0)", ("admin", _password_hash(password)))

    def login(self, username: str, password: str) -> tuple[str, Principal]:
        now = int(time.time())
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            failures = db.execute("SELECT * FROM login_failures WHERE username=?", (username,)).fetchone()
            if failures and failures["locked_until"] > now:
                raise LoginLocked()
            row = db.execute("SELECT * FROM accounts WHERE username=?", (username,)).fetchone()
            valid = row is not None and _verify_password(password, row["password_hash"])
            if not valid:
                attempts = (failures["attempts"] + 1 if failures and now - failures["last_failed_at"] < LOCKOUT_SECONDS else 1)
                locked_until = now + LOCKOUT_SECONDS if attempts >= MAX_FAILURES else 0
                db.execute(
                    "INSERT INTO login_failures VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET attempts=excluded.attempts, last_failed_at=excluded.last_failed_at, locked_until=excluded.locked_until",
                    (username, attempts, now, locked_until),
                )
                db.commit()  # Failure counters must persist even when login is denied.
                if locked_until:
                    raise LoginLocked()
                raise LoginDenied()
            db.execute("DELETE FROM login_failures WHERE username=?", (username,))
            db.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))
            token = secrets.token_urlsafe(48)
            digest = sha256(token.encode("ascii")).hexdigest()
            csrf_token = secrets.token_urlsafe(32)
            db.execute("INSERT INTO sessions VALUES(?,?,?,?)", (digest, username, csrf_token, now + SESSION_TTL_SECONDS))
            return token, Principal(username, bool(row["must_change_password"]), csrf_token, digest)

    def authenticate(self, token: str | None) -> Principal | None:
        if not token or len(token) > 256:
            return None
        digest = sha256(token.encode("utf-8")).hexdigest()
        with self._connect() as db:
            row = db.execute(
                "SELECT s.username, s.csrf_token, a.must_change_password FROM sessions s "
                "JOIN accounts a ON s.username=a.username "
                "WHERE s.token_digest=? AND s.expires_at>?",
                (digest, int(time.time())),
            ).fetchone()
        return Principal(row["username"], bool(row["must_change_password"]), row["csrf_token"], digest) if row else None

    def logout(self, principal: Principal) -> None:
        with self._connect() as db:
            db.execute("DELETE FROM sessions WHERE token_digest=?", (principal.token_digest,))

    def change_password(self, principal: Principal, old: str, new: str) -> None:
        _validate_new_password(new)
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT password_hash FROM accounts WHERE username=?", (principal.username,)).fetchone()
            if row is None or not _verify_password(old, row["password_hash"]):
                raise LoginDenied()
            if hmac.compare_digest(old, new):
                raise ValueError("Password baru harus berbeda")
            db.execute("UPDATE accounts SET password_hash=?, must_change_password=0 WHERE username=?", (_password_hash(new), principal.username))
            db.execute("DELETE FROM sessions WHERE username=?", (principal.username,))
