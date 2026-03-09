import asyncio
import os

import paramiko


_SENSITIVE_KEYS = {"password", "passphrase", "private_key", "token", "secret"}


def _load_private_key(private_key_path: str, passphrase: str = None):
    expanded_key_path = os.path.abspath(os.path.expanduser(private_key_path))
    if not os.path.exists(expanded_key_path):
        raise ValueError(f"Private key file not found: {expanded_key_path}")

    pkey_class = getattr(paramiko, "PKey", None)
    from_path = getattr(pkey_class, "from_path", None) if pkey_class else None
    if callable(from_path):
        try:
            return from_path(expanded_key_path, passphrase=passphrase)
        except Exception:
            pass

    key_loaders = []
    for key_class_name in ("RSAKey", "ECDSAKey", "Ed25519Key", "DSSKey"):
        key_class = getattr(paramiko, key_class_name, None)
        if key_class is not None:
            key_loaders.append(key_class.from_private_key_file)

    errors = []

    for load_key in key_loaders:
        try:
            return load_key(expanded_key_path, password=passphrase)
        except Exception as exc:
            errors.append(str(exc))
            continue

    raise ValueError(
        "Unable to load private key file with supported key types. "
        f"Path: {expanded_key_path}. "
        f"Reason: {errors[-1] if errors else 'unknown key format or passphrase required'}"
    )


def _validate_sftp_config(sftp_config: dict):
    required_fields = ["host", "username", "private_key_path", "remote_path"]
    missing = [field for field in required_fields if not sftp_config.get(field)]
    if missing:
        raise ValueError(f"Missing SFTP config fields: {', '.join(missing)}")


def _fetch_sftp_data_sync(sftp_config: dict):
    _validate_sftp_config(sftp_config)

    host = sftp_config["host"]
    port = int(sftp_config.get("port", 22))
    username = sftp_config["username"]
    private_key_path = sftp_config["private_key_path"]
    passphrase = sftp_config.get("passphrase")
    remote_path = sftp_config["remote_path"]
    known_hosts_path = sftp_config.get("known_hosts_path")

    private_key = _load_private_key(private_key_path, passphrase=passphrase)

    ssh_client = paramiko.SSHClient()
    ssh_client.load_system_host_keys()
    if known_hosts_path:
        expanded_known_hosts = os.path.abspath(os.path.expanduser(known_hosts_path))
        ssh_client.load_host_keys(expanded_known_hosts)
    ssh_client.set_missing_host_key_policy(paramiko.RejectPolicy())

    try:
        ssh_client.connect(
            hostname=host,
            port=port,
            username=username,
            pkey=private_key,
            look_for_keys=False,
            allow_agent=False,
            timeout=30,
        )
    except paramiko.AuthenticationException as exc:
        raise ValueError(
            "SFTP authentication failed. Verify username, private key, and passphrase. "
            f"Target: {username}@{host}:{port}."
        ) from exc
    except paramiko.BadHostKeyException as exc:
        raise ValueError(
            "SFTP host key validation failed. Update known_hosts or provide correct known_hosts_path. "
            f"Target: {host}:{port}."
        ) from exc
    except paramiko.SSHException as exc:
        raise ValueError(f"SFTP SSH error: {str(exc)}") from exc
    except OSError as exc:
        raise ValueError(f"SFTP network error: {str(exc)}") from exc

    try:
        with ssh_client.open_sftp() as sftp:
            try:
                with sftp.file(remote_path, "rb") as remote_file:
                    return remote_file.read()
            except FileNotFoundError as exc:
                remote_cwd = sftp.normalize(".")
                raise ValueError(
                    f"Remote file not found: {remote_path}. "
                    f"SFTP working directory: {remote_cwd}. "
                    "Use a valid path on the SFTP server for the selected username."
                ) from exc
    finally:
        ssh_client.close()


async def fetch_sftp_data(sftp_config: dict):
    return await asyncio.to_thread(_fetch_sftp_data_sync, sftp_config)
