import re, unittest
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
script = (repo/'config/scripts/install-naia-toolchain.sh').read_text()

class Toolchain(unittest.TestCase):
    def value(self, name):
        match = re.search(rf'^{name}="([^"]+)"$', script, re.M)
        self.assertIsNotNone(match, name)
        return match.group(1)
    def test_herdr_is_pinned_by_version_and_digest(self):
        self.assertRegex(self.value('HERDR_VERSION'), r'^\d+\.\d+\.\d+$')
        self.assertRegex(self.value('HERDR_SHA256'), r'^[0-9a-f]{64}$')
        self.assertIn('/download/v${HERDR_VERSION}/herdr-linux-x86_64', self.value('HERDR_URL'))
        self.assertIn('sha256sum --check', script)
        self.assertNotIn('latest', self.value('HERDR_URL'))
    def test_herdr_check_runs_before_install(self):
        self.assertLess(script.index('sha256sum --check'), script.index('install -Dm0755 "$tmp/herdr" /usr/bin/herdr'))
    def test_every_tool_is_asserted_not_best_effort(self):
        self.assertTrue(script.startswith('#!/usr/bin/env bash'))
        self.assertIn('set -euo pipefail', script)
        self.assertNotIn('|| true', script)
        for needle in ['rpm -q gh', '/usr/bin/herdr', 'rpm -q nodejs npm', 'rpm -q google-chrome-stable',
                       '/usr/share/homebrew.tar.zst', 'brew-setup.service',
                       '/usr/bin/tailscale', 'systemctl enable tailscaled.service', 'sshd.service', '00-naia-brew.sh']:
            self.assertIn(needle, script)
    def test_both_recipes_run_the_script(self):
        for recipe in ['recipe.yml', 'recipe-amd.yml', 'recipe-amd-server.yml']:
            self.assertIn('install-naia-toolchain.sh', (repo/'recipes'/recipe).read_text())

if __name__ == '__main__':
    unittest.main()
