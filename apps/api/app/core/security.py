from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from .config import DATA_DIR

_KEY_FILE = DATA_DIR / ".master_key"


def _load_key() -> bytes:
    if _KEY_FILE.exists():
        return _KEY_FILE.read_bytes().strip()
    key = Fernet.generate_key()
    _KEY_FILE.write_bytes(key)
    try:
        _KEY_FILE.chmod(0o600)
    except OSError:
        pass
    return key


_fernet = Fernet(_load_key())


def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    return _fernet.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet.decrypt(value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def mask_secret(value: str | None) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:3]}...{value[-4:]}"
