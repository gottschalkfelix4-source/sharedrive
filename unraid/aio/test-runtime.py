#!/usr/bin/env python3
"""Focused initialization contracts; run as root inside the built AIO image."""

import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('aio_entrypoint', Path(__file__).with_name('entrypoint.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
service_spec = importlib.util.spec_from_file_location('aio_service', Path(__file__).with_name('service.py'))
service = importlib.util.module_from_spec(service_spec)
service_spec.loader.exec_module(service)


class SettingEnvironmentTests(unittest.TestCase):
    def test_only_explicit_nonempty_mapped_settings_are_forwarded(self):
        mappings = [{'key': 'app.name', 'env': 'SHAREDRIVE_APP_NAME'},
                    {'key': 'email.password', 'env': 'SHAREDRIVE_SMTP_PASSWORD'},
                    {'key': 'email.enabled', 'env': 'SHAREDRIVE_SMTP_ENABLED'}]
        source = {'SHAREDRIVE_APP_NAME': 'Custom name', 'SHAREDRIVE_SMTP_PASSWORD': '',
                  'SHAREDRIVE_SMTP_ENABLED': 'false', 'SHAREDRIVE_UNKNOWN': 'ignored',
                  'MINIO_SECRET_KEY': 'internal', 'PGPASSWORD': 'internal'}
        with tempfile.TemporaryDirectory() as directory:
            mapping_file = Path(directory) / 'settings.json'
            mapping_file.write_text(json.dumps(mappings))
            with patch.object(service, 'SETTINGS_MAP', mapping_file):
                self.assertEqual(service.app_setting_environment(source),
                                 {'SHAREDRIVE_APP_NAME': 'Custom name',
                                  'SHAREDRIVE_SMTP_ENABLED': 'false'})

    def test_nonempty_whitespace_is_preserved_for_backend_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            mapping_file = Path(directory) / 'settings.json'
            mapping_file.write_text('[{"key":"app.name","env":"SHAREDRIVE_APP_NAME"}]')
            with patch.object(service, 'SETTINGS_MAP', mapping_file):
                self.assertEqual(service.app_setting_environment({'SHAREDRIVE_APP_NAME': '  '}),
                                 {'SHAREDRIVE_APP_NAME': '  '})


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / 'data'
        self.seed = Path(self.temp.name) / 'seed'
        self.seed.mkdir()
        (self.seed / 'main.cvd').write_bytes(b'fixture-signature')
        self.patches = [
            patch.object(runtime, 'DATA', self.data),
            patch.object(runtime, 'CONFIG', self.data / 'config'),
            patch.object(runtime, 'SECRETS', self.data / 'config' / 'secrets.json'),
            patch.object(runtime, 'PG', self.data / 'postgres'),
            patch.object(runtime, 'CLAM_SEED', self.seed),
            patch.object(runtime.subprocess, 'run', side_effect=self.initdb),
        ]
        for mock in self.patches:
            mock.start()

    def tearDown(self):
        self.release_lock()
        for mock in reversed(self.patches):
            mock.stop()
        self.temp.cleanup()

    def release_lock(self):
        if runtime.LOCK_FD is not None:
            os.close(runtime.LOCK_FD)
            runtime.LOCK_FD = None

    def initdb(self, command, **_kwargs):
        self.assertIn('--auth-host=scram-sha-256', command)
        (self.data / 'postgres' / 'PG_VERSION').write_text('16\n')

    def initialize(self):
        self.release_lock()
        with contextlib.redirect_stdout(io.StringIO()):
            runtime.initialize()

    def initialized_fixture(self):
        self.initialize()
        (self.data / 'config' / 'database.initialized').write_text('16\n')
        (self.data / 'redis' / 'fixture').write_text('preserve')
        (self.data / 'minio' / 'fixture').write_text('preserve')

    def test_generated_credentials_private_and_restart_stable(self):
        self.initialize()
        secrets = self.data / 'config' / 'secrets.json'
        token = self.data / '.setup' / 'token'
        before = secrets.read_bytes(), token.read_bytes()
        values = json.loads(before[0])
        self.assertEqual(len({values[key] for key in runtime.SECRET_KEYS}), 4)
        for key in runtime.SECRET_KEYS:
            self.assertRegex(values[key], r'^[0-9a-f]{64}$')
        self.assertEqual(secrets.stat().st_mode & 0o777, 0o600)
        self.assertEqual(token.stat().st_mode & 0o777, 0o600)
        self.initialize()
        self.assertEqual(before, (secrets.read_bytes(), token.read_bytes()))

    def test_missing_secrets_never_regenerates_existing_credentials(self):
        self.initialized_fixture()
        secrets = self.data / 'config' / 'secrets.json'
        secrets.unlink()
        with self.assertRaisesRegex(RuntimeError, 'secrets.json is missing'):
            self.initialize()
        self.assertFalse(secrets.exists())
        self.assertEqual((self.data / 'minio' / 'fixture').read_text(), 'preserve')

    def test_major_mismatch_refuses_without_changing_pg_data(self):
        self.initialize()
        version = self.data / 'postgres' / 'PG_VERSION'
        version.write_text('17\n')
        with self.assertRaisesRegex(RuntimeError, 'not major version 16'):
            self.initialize()
        self.assertEqual(version.read_text(), '17\n')

    def test_incomplete_initialized_appdata_is_not_recreated(self):
        self.initialized_fixture()
        version = self.data / 'postgres' / 'PG_VERSION'
        version.unlink()
        with self.assertRaisesRegex(RuntimeError, 'appdata is incomplete'):
            self.initialize()
        self.assertFalse(version.exists())

    def test_missing_setup_token_is_not_regenerated(self):
        self.initialized_fixture()
        token = self.data / '.setup' / 'token'
        token.unlink()
        with self.assertRaisesRegex(RuntimeError, 'setup token is missing'):
            self.initialize()
        self.assertFalse(token.exists())

    def test_invalid_secret_schema_is_rejected(self):
        self.initialize()
        secrets = self.data / 'config' / 'secrets.json'
        secrets.write_text('[]\n')
        with self.assertRaisesRegex(RuntimeError, 'Invalid or incompatible secrets'):
            self.initialize()
        self.assertEqual(secrets.read_text(), '[]\n')

    def test_data_lock_is_exclusive_and_survives_exec(self):
        self.initialize()
        self.assertTrue(os.get_inheritable(runtime.LOCK_FD))
        with self.assertRaisesRegex(RuntimeError, 'already using this appdata'):
            runtime.lock_data()
        self.assertEqual((self.data / 'config' / 'aio.lock').stat().st_mode & 0o777, 0o600)

    def test_symlink_lock_is_rejected(self):
        self.initialize()
        self.release_lock()
        lock = self.data / 'config' / 'aio.lock'
        lock.unlink()
        lock.symlink_to(self.data / '.setup' / 'token')
        with self.assertRaisesRegex(RuntimeError, 'lock must not be a symlink'):
            runtime.lock_data()


if __name__ == '__main__':
    unittest.main(verbosity=2)
