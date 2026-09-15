import runpy, tempfile, unittest
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
tool = runpy.run_path(str(repo/'config/files/usr/libexec/naia-default-hostname'))
unit = repo/'config/files/usr/lib/systemd/system/naia-default-hostname.service'

class DefaultHostname(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.etc = Path(self.temp.name)
        self.kernel, self.labels = [], []
    def apply(self, current='bazzite'):
        return tool['apply'](self.etc, current, self.kernel.append, self.labels.append)
    def test_fresh_install_gets_naiaos(self):
        self.assertTrue(self.apply())
        self.assertEqual((self.etc/'hostname').read_text(), 'naiaos\n')
        self.assertEqual(((self.etc/'hostname').stat().st_mode) & 0o777, 0o644)
        self.assertEqual(self.kernel, ['naiaos'])
        self.assertEqual(self.labels, [self.etc/'hostname'])
        self.assertFalse((self.etc/'.hostname.naia-tmp').exists())
    def test_empty_or_comment_only_file_counts_as_unconfigured(self):
        # bazzite-hardware-setup touches an empty /etc/hostname
        for text in ['', '\n', '# no name yet\n  \n']:
            (self.etc/'hostname').write_text(text)
            self.kernel.clear()
            self.assertTrue(self.apply('fedora'))
            self.assertEqual(self.kernel, ['naiaos'])
    def test_owner_chosen_name_is_kept(self):
        (self.etc/'hostname').write_text('bc250\n')
        self.assertFalse(self.apply())
        self.assertEqual((self.etc/'hostname').read_text(), 'bc250\n')
        self.assertEqual(self.kernel, [])
    def test_explicit_bazzite_name_in_file_is_kept(self):
        (self.etc/'hostname').write_text('bazzite\n')
        self.assertFalse(self.apply())
    def test_kernel_argument_or_other_runtime_name_is_kept(self):
        self.assertFalse(self.apply('studio-pc'))
        self.assertFalse((self.etc/'hostname').exists())
    def test_rerun_is_a_no_op(self):
        self.assertTrue(self.apply())
        self.assertFalse(self.apply('naiaos'))
        self.assertEqual(self.kernel, ['naiaos'])
    def test_unit_orders_before_hostname_consumers(self):
        text = unit.read_text()
        before = next(line for line in text.splitlines() if line.startswith('Before='))
        for consumer in ['systemd-hostnamed.service', 'bazzite-hardware-setup.service', 'NetworkManager.service']:
            self.assertIn(consumer, before)
        self.assertIn('ConditionPathIsReadWrite=/etc', text)
        self.assertIn('WantedBy=sysinit.target', text)
    def test_both_recipes_enable_the_unit(self):
        for recipe in ['recipe.yml', 'recipe-amd.yml']:
            self.assertIn('naia-default-hostname.service', (repo/'recipes'/recipe).read_text())

if __name__ == '__main__':
    unittest.main()
