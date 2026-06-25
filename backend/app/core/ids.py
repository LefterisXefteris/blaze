import secrets


def generate_id() -> str:
    return secrets.token_hex(12)
