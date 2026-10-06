#!/usr/bin/env python3
"""Launch one foreground service with only its required credentials."""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

PG_BIN = '/usr/lib/postgresql/16/bin'


def wait_for(callback, description):
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        try:
            if callback():
                return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise RuntimeError(f'Timed out waiting for {description}')


def clam_ready():
    with socket.create_connection(('127.0.0.1', 3310), timeout=3) as connection:
        connection.sendall(b'zPING\0')
        return connection.recv(64).startswith(b'PONG')


def storage_ready():
    with urllib.request.urlopen('http://127.0.0.1:9000/minio/health/ready', timeout=3) as response:
        return response.status == 200


def execute(user, command, environment):
    os.execvpe('gosu', ['gosu', user, *command], environment)


def launch(service):
    if service == 'freshclam-loop':
        # Keep the seeded scanner available even when a CDN update is offline.
        while True:
            result = subprocess.run(['freshclam', '--stdout',
                                     '--config-file=/opt/sharedrive/aio/freshclam.conf'])
            if result.returncode:
                print('ClamAV signature update unavailable; the existing signatures remain active.',
                      file=sys.stderr, flush=True)
            time.sleep(43200)
    secrets = json.loads(Path('/data/config/secrets.json').read_text())
    environment = {
        'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'LANG': 'C.UTF-8', 'HOME': '/tmp', 'TZ': os.environ.get('TZ', 'UTC'),
    }
    if service == 'postgres':
        execute('postgres', [f'{PG_BIN}/postgres', '-D', '/data/postgres',
                '-c', 'listen_addresses=127.0.0.1', '-c', 'port=5432',
                '-c', 'unix_socket_directories=/run/sharedrive/postgres',
                '-c', 'password_encryption=scram-sha-256'], environment)
    elif service == 'redis':
        execute('redis', ['redis-server', '/run/sharedrive/redis.conf'], environment)
    elif service == 'minio':
        environment.update(MINIO_ROOT_USER='sharedrive',
                           MINIO_ROOT_PASSWORD=secrets['minio_password'],
                           MINIO_BROWSER='off', MINIO_UPDATE='off')
        execute('node', ['minio', 'server', '/data/minio',
                '--address', '127.0.0.1:9000', '--console-address', '127.0.0.1:9001'], environment)
    elif service == 'clamav':
        execute('clamav', ['clamd', '--foreground=true',
                '--config-file=/opt/sharedrive/aio/clamd.conf'], environment)
    elif service == 'freshclam':
        execute('clamav', ['python3', '/opt/sharedrive/aio/service.py', 'freshclam-loop'], environment)
    elif service == 'app':
        database_environment = {**environment, 'PGPASSWORD': secrets['postgres_password']}
        query_command = [f'{PG_BIN}/psql', '-h', '127.0.0.1', '-U', 'sharedrive',
                         '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']

        def database_ready():
            return subprocess.run([*query_command, '-c', 'SELECT 1'], env=database_environment,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

        wait_for(database_ready, 'PostgreSQL')
        database_exists = subprocess.run([
            *query_command, '-c', "SELECT 1 FROM pg_database WHERE datname = 'sharedrive'",
        ], env=database_environment, capture_output=True, text=True, check=True).stdout.strip() == '1'
        marker = Path('/data/config/database.initialized')
        if not database_exists:
            if marker.exists():
                raise RuntimeError('Previously initialized ShareDrive database is missing. Restore the complete appdata backup.')
            subprocess.run([f'{PG_BIN}/createdb', '-h', '127.0.0.1', '-U', 'sharedrive',
                            'sharedrive'], env=database_environment, check=True)
        if not marker.exists():
            descriptor = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'w') as output:
                output.write('16\n')
                output.flush()
                os.fsync(output.fileno())
        redis_environment = {**environment, 'REDISCLI_AUTH': secrets['redis_password']}
        wait_for(lambda: subprocess.run(['redis-cli', '-h', '127.0.0.1', 'ping'],
                 env=redis_environment, capture_output=True, text=True).stdout.strip() == 'PONG', 'Redis')
        wait_for(storage_ready, 'MinIO')
        wait_for(clam_ready, 'ClamAV signatures and scanner')
        environment.update(
            NODE_ENV='production', PORT='3000',
            DATABASE_URL=f"postgresql://sharedrive:{secrets['postgres_password']}@127.0.0.1:5432/sharedrive",
            REDIS_URL=f"redis://:{secrets['redis_password']}@127.0.0.1:6379",
            MINIO_ENDPOINT='127.0.0.1', MINIO_PORT='9000', MINIO_USE_SSL='false',
            MINIO_ACCESS_KEY='sharedrive', MINIO_SECRET_KEY=secrets['minio_password'],
            MINIO_BUCKET='sharedrive', CLAMAV_HOST='127.0.0.1', CLAMAV_PORT='3310',
            JWT_SECRET=secrets['jwt_secret'], SETUP_TOKEN_FILE='/data/.setup/token',
            TRUST_PROXY=os.environ.get('TRUST_PROXY', 'loopback'),
        )
        if os.environ.get('SMTP_ALLOWED_HOSTS'):
            environment['SMTP_ALLOWED_HOSTS'] = os.environ['SMTP_ALLOWED_HOSTS']
        os.chdir('/app')
        subprocess.run(['gosu', 'node', '/app/node_modules/.bin/prisma', 'migrate', 'deploy'],
                       env=environment, check=True)
        execute('node', ['node', '/app/dist/index.js'], environment)
    else:
        raise RuntimeError('Unknown service')


if __name__ == '__main__':
    try:
        launch(sys.argv[1])
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'ShareDrive AIO service {sys.argv[1]} failed: {error}', file=sys.stderr, flush=True)
        sys.exit(1)
