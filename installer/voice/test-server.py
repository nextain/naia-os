#!/usr/bin/env python3
"""Source-tree checks for the AMD server backbone recipe (nextain/naia-os#5)."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RECIPE = (ROOT / "recipes" / "recipe-amd-server.yml").read_text(encoding="utf-8")
QUADLET = ROOT / "config/files/usr/share/containers/systemd/naia-voice-host.container"
INSTALL = (ROOT / "config/scripts/install-naia-server-workloads.sh").read_text(encoding="utf-8")
SECRETS = (
    "account-key",
    "voice-host-token",
    "relay-key",
    "cf-api-token",
    "cf-tunnel-token",
    "cloudflared.env",
    "TUNNEL_TOKEN=",
)


class ServerRecipe(unittest.TestCase):
    def test_separate_image_name(self) -> None:
        self.assertIn("name: naia-os-amd-server", RECIPE)
        self.assertNotIn("name: naia-os-amd\n", RECIPE.split("description:", 1)[0] + "\n")
        self.assertIn("install-naia-server-workloads.sh", RECIPE)
        self.assertIn("install-bc250.sh", RECIPE)
        self.assertIn("podman", RECIPE)

    def test_recipe_does_not_enable_voice_unit(self) -> None:
        self.assertNotIn("naia-voice-host", RECIPE.split("enabled:", 1)[-1] if "enabled:" in RECIPE else RECIPE)
        enabled = RECIPE.split("enabled:", 1)[1].split("- type:", 1)[0] if "enabled:" in RECIPE else ""
        self.assertIn("naia-default-hostname.service", enabled)
        self.assertNotIn("voice", enabled)

    def test_quadlet_exists_without_secrets(self) -> None:
        text = QUADLET.read_text(encoding="utf-8")
        self.assertIn("AddDevice=/dev/dri", text)
        self.assertIn("127.0.0.1:8910:8910", text)
        self.assertNotIn("EnvironmentFile", text)
        for name in SECRETS:
            self.assertNotIn(name, text)

    def test_install_script_refuses_enabled_units_and_secrets(self) -> None:
        self.assertIn("FATAL: workload unit enabled", INSTALL)
        self.assertIn("account-key", INSTALL)
        self.assertIn("podman", INSTALL)
        self.assertIn("secret filenames", INSTALL)

    def test_variant_ref_is_server(self) -> None:
        ref = (ROOT / "config/files/variant/amd-server/usr/share/naia/image-ref").read_text(encoding="utf-8").strip()
        self.assertEqual(ref, "ghcr.io/nextain/naia-os-amd-server")

    def test_source_tree_has_no_secret_files(self) -> None:
        for path in (ROOT / "installer/voice").rglob("*"):
            if path.is_file() and path.name in SECRETS:
                self.fail(path)


if __name__ == "__main__":
    raise SystemExit(0 if unittest.main(verbosity=2, exit=False).result.wasSuccessful() else 1)
