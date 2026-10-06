#!/usr/bin/env python3
"""Initialize persistent AIO state, then hand PID 1 to Supervisor."""

import fcntl
import json
import os
import pwd
import re
import secrets
import shutil
import stat
import subprocess
import sys
from pathlib import Path

DATA = Path('/data')
CONFIG = DATA / 'config'
SECRETS = CONFIG / 'secrets.json'
PG = DATA / 'postgres'
PG_BIN = '/usr/lib/postgresql/16/bin'
CLAM_SEED = Path('/opt/sharedrive/clamav-seed')
SECRET_KEYS = ('postgres_password', 'redis_password', 'minio_password', 'jwt_secret')
LOCK_FD = None


def fail(message):
    raise RuntimeError(message)


def user_id(name):
    account = pwd.getpwnam(name)
    return account.pw_uid, account.pw_gid


def directory(path, user, mode):
    if path.is_symlink() or (path.exists() and not path.is_dir()):
        fail(f'{path} must be a real directory')
    path.mkdir(parents=True, exist_ok=True)
    os.chown(path, *user_id(user))
    path.chmod(mode)


def atomic_file(path, content, user='root', mode=0o600):
    temporary = path.parent / f'.{path.name}.{secrets.token_hex(8)}.tmp'
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(descriptor, 'w') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chown(temporary, *user_id(user))
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temporary.unlink(missing_ok=True)


def lock_data():
    global LOCK_FD
    path = CONFIG / 'aio.lock'
    if path.is_symlink():
        fail('The AIO lock must not be a symlink')
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            fail('The AIO lock must be a regular file')
        os.fchmod(descriptor, 0o600)
        os.fchown(descriptor, *user_id('root'))
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            fail('Another ShareDrive AIO container is already using this appdata directory')
        # The root Supervisor keeps this descriptor open across exec for its lifetime.
        os.set_inheritable(descriptor, True)
        LOCK_FD = descriptor
    except BaseException:
        os.close(descriptor)
        raise


def initialize():
    if os.getuid() != 0:
        fail('AIO requires its default root entrypoint; services drop privileges internally')
    os.umask(0o077)
    if DATA.is_symlink():
        fail('/data must not be a symlink')
    DATA.mkdir(exist_ok=True)
    DATA.chmod(0o755)
    directory(CONFIG, 'root', 0o700)
    lock_data()
    initialized = CONFIG / 'database.initialized'
    if initialized.is_symlink():
        fail('The database initialization marker must not be a symlink')
    if initialized.exists():
        if initialized.read_text().strip() != '16':
            fail('Invalid database initialization marker; restore the complete appdata backup')
        if (any(not (DATA / name).is_dir() for name in ('postgres', 'redis', 'minio', '.setup'))
                or not (PG / 'PG_VERSION').is_file()):
            fail('Initialized appdata is incomplete. Restore the complete appdata backup; missing storage will not be recreated.')
    persisted = any(
        (DATA / name).exists() and any((DATA / name).iterdir())
        for name in ('postgres', 'redis', 'minio')
    )
    if SECRETS.is_symlink():
        fail('The secrets file must not be a symlink')
    if not SECRETS.exists():
        if persisted:
            fail('Persistent data exists but secrets.json is missing. Restore the complete appdata backup; credentials will not be regenerated.')
        values = {'version': 1, 'postgres_major': 16}
        values.update({key: secrets.token_hex(32) for key in SECRET_KEYS})
        atomic_file(SECRETS, json.dumps(values, indent=2) + '\n')
    values = json.loads(SECRETS.read_text())
    if (not isinstance(values, dict)
            or set(values) != {'version', 'postgres_major', *SECRET_KEYS}
            or values.get('version') != 1 or values.get('postgres_major') != 16
            or any(not isinstance(values.get(key), str)
                   or not re.fullmatch(r'[0-9a-f]{64}', values[key]) for key in SECRET_KEYS)):
        fail('Invalid or incompatible secrets.json. Restore the original file; do not reset credentials.')
    os.chown(SECRETS, *user_id('root'))
    SECRETS.chmod(0o600)
    for name, user in (('postgres', 'postgres'), ('redis', 'redis'),
                       ('minio', 'node'), ('clamav', 'clamav'), ('.setup', 'node')):
        directory(DATA / name, user, 0o700 if name != 'clamav' else 0o755)
    setup = DATA / '.setup' / 'token'
    if setup.is_symlink():
        fail('The setup token must not be a symlink')
    if not setup.exists():
        if persisted:
            fail('Persistent data exists but the setup token is missing. Restore the complete appdata backup.')
        atomic_file(setup, secrets.token_hex(32) + '\n', 'node')
    if not re.fullmatch(r'[0-9a-f]{64}', setup.read_text().strip()):
        fail('Invalid setup token; restore the original token file')
    os.chown(setup, *user_id('node'))
    setup.chmod(0o600)
    directory(Path('/run/sharedrive'), 'root', 0o755)
    directory(Path('/run/sharedrive/postgres'), 'postgres', 0o700)
    directory(Path('/run/clamav'), 'clamav', 0o755)
    version = PG / 'PG_VERSION'
    if version.is_symlink():
        fail('PostgreSQL PG_VERSION must not be a symlink')
    if version.exists():
        if version.read_text().strip() != '16':
            fail('PostgreSQL data is not major version 16. A manual database migration is required; startup refused.')
    elif any(PG.iterdir()):
        fail('PostgreSQL directory is nonempty without PG_VERSION. Restore a complete backup or use a new empty appdata directory.')
    else:
        password_file = Path('/run/sharedrive/postgres/password')
        atomic_file(password_file, values['postgres_password'] + '\n', 'postgres')
        try:
            subprocess.run([
                'gosu', 'postgres', f'{PG_BIN}/initdb', '-D', str(PG),
                '--username=sharedrive', '--encoding=UTF8', '--locale=C.UTF-8',
                '--auth-local=peer', '--auth-host=scram-sha-256',
                f'--pwfile={password_file}',
            ], check=True)
        finally:
            password_file.unlink(missing_ok=True)
    clam_data = DATA / 'clamav'
    if not any(clam_data.glob('*.cvd')) and not any(clam_data.glob('*.cld')):
        for source in CLAM_SEED.glob('*.cvd'):
            destination = clam_data / source.name
            shutil.copyfile(source, destination)
            os.chown(destination, *user_id('clamav'))
            destination.chmod(0o644)
    if not any(clam_data.glob('*.cvd')) and not any(clam_data.glob('*.cld')):
        fail('No bundled ClamAV signatures are available; refusing to start without virus scanning')
    # Keep Redis credentials in a private runtime file, never in process arguments.
    atomic_file(Path('/run/sharedrive/redis.conf'), '\n'.join([
        'bind 127.0.0.1', 'port 6379', 'protected-mode yes', 'daemonize no',
        'dir /data/redis', 'appendonly yes', 'appendfsync everysec',
        f"requirepass {values['redis_password']}", 'logfile ""', '',
    ]), 'redis')
    print('ShareDrive AIO starting. Persistent data: /data; first-run token: /data/.setup/token', flush=True)


if __name__ == '__main__':
    try:
        initialize()
        os.execvp('supervisord', ['supervisord', '-n', '-c', '/opt/sharedrive/aio/supervisord.conf'])
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'ShareDrive AIO initialization failed: {error}', file=sys.stderr, flush=True)
        sys.exit(1)
