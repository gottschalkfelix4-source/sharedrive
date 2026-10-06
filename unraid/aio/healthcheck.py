#!/usr/bin/env python3
"""Health covers the full appliance, including its virus scanner."""

import json
import socket
import subprocess
import sys
import urllib.request


def healthy():
    result = subprocess.run([
        'supervisorctl', '-c', '/opt/sharedrive/aio/supervisord.conf', 'status',
    ], capture_output=True, text=True, timeout=3)
    lines = result.stdout.splitlines()
    expected = {'postgres', 'redis', 'minio', 'clamav', 'freshclam', 'app'}
    if result.returncode or len(lines) != len(expected):
        return False
    if any(len(parts := line.split()) < 2 or parts[0] not in expected
           or parts[1] != 'RUNNING' for line in lines):
        return False
    with urllib.request.urlopen('http://127.0.0.1:3000/api/ready', timeout=3) as response:
        if response.status != 200 or json.load(response).get('ok') is not True:
            return False
    with socket.create_connection(('127.0.0.1', 3310), timeout=3) as connection:
        connection.sendall(b'zPING\0')
        return connection.recv(64).startswith(b'PONG')


if __name__ == '__main__':
    try:
        sys.exit(0 if healthy() else 1)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        sys.exit(1)
