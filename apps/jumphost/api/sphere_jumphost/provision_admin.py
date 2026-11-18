"""Provision a non-default admin password; example: python -m sphere_jumphost.provision_admin."""
from getpass import getpass
from sphere_jumphost.security.auth_store import AuthSettings, AuthStore


def main() -> None:
    settings = AuthSettings.from_env()
    if settings.allow_insecure_dev_bootstrap:
        raise SystemExit("Disable DEV bootstrap before provisioning")
    password = getpass("Enter new strong admin password (min 12 chars): ")
    confirmation = getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match")
    AuthStore(settings).provision_admin(password)
    print("Admin provisioned. Password is not printed or persisted in plaintext.")


if __name__ == "__main__":
    main()
