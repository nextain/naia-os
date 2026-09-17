import unittest
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
welcome = (repo / "config/files/usr/libexec/naia-live-welcome").read_text()
persist = (repo / "config/files/usr/libexec/naia-create-persistence").read_text()
hook = (repo / "installer/hook-post-rootfs.sh").read_text()
branding = (repo / "config/scripts/branding.sh").read_text()
firefox = (repo / "config/files/usr/bin/firefox").read_text()
amd = (repo / "recipes/recipe-amd.yml").read_text()
nvidia = (repo / "recipes/recipe.yml").read_text()
verify = (repo / "config/files/usr/libexec/naia-verify-image").read_text()


class FirstBoot(unittest.TestCase):
    def test_welcome_follows_korean(self):
        self.assertIn("USB로 쓰기", welcome)
        self.assertIn("이 컴퓨터에 설치", welcome)
        self.assertIn("그냥 둘러보기", welcome)
        self.assertIn("이 USB를 어떻게 쓸까요?", welcome)
        self.assertLess(welcome.index("LANG_CODE="), welcome.index("USB로 쓰기"))

    def test_welcome_does_not_hardcode_english_after_language(self):
        after = welcome.split("naia-set-language", 1)[1]
        self.assertNotIn("How do you want to use Naia OS?", after)

    def test_persist_expands_isohybrid_gpt(self):
        self.assertIn("sfdisk --relocate gpt-bak-to-end", persist)
        self.assertIn("sfdisk", persist.split("for tool in", 1)[1][:200])

    def test_portal_is_removed_in_image_and_iso(self):
        self.assertIn("bazzite-portal.desktop", branding)
        self.assertIn("bazzite-portal.desktop", hook)
        self.assertIn("yafti", branding)
        self.assertIn("/etc/skel/.config/autostart", branding)
        self.assertIn("/etc/skel/.config/autostart", hook)

    def test_iso_hook_does_not_let_rpm_firefox_replace_shim(self):
        self.assertIn("preserving image firefox shim", hook)
        self.assertNotIn("dnf install -y --allowerasing git firefox", hook)

    def test_firefox_shim_and_flatpaks(self):
        self.assertIn("org.mozilla.firefox", firefox)
        self.assertIn("com.google.Chrome", firefox)
        for recipe in (amd, nvidia):
            self.assertIn("org.mozilla.firefox", recipe)
            self.assertIn("com.google.Chrome", recipe)

    def test_amd_recipe_enables_bc250_units(self):
        self.assertIn("install-bc250.sh", amd)
        self.assertNotIn("install-bc250.sh", nvidia)
        self.assertTrue((repo / "config/files/usr/libexec/naia-bc250-nosleep").exists())

    def test_image_verifier_covers_the_new_gates(self):
        self.assertIn("USB로 쓰기", verify)
        self.assertIn("/usr/bin/firefox", verify)
        self.assertIn("gpt-bak-to-end", verify)


if __name__ == "__main__":
    unittest.main()
