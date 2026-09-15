import os, runpy, tempfile, unittest
from unittest import mock
from pathlib import Path

source = Path(__file__).resolve().parent
audio = runpy.run_path(str(source/'naia-bc250-dp-audio'))
nosleep = runpy.run_path(str(source/'naia-bc250-nosleep'))

class SleepBlock(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.sys, self.run = root/'sys', root/'run'
        (self.sys/'bus/pci/devices').mkdir(parents=True)
        (self.sys/'class/dmi/id').mkdir(parents=True)
        self.dropin = self.run/nosleep['DROPIN']
    def gpu(self, slot, vendor, device):
        path = self.sys/'bus/pci/devices'/slot
        path.mkdir()
        (path/'vendor').write_text(vendor + '\n')
        (path/'device').write_text(device + '\n')
    def dmi(self, board, product):
        (self.sys/'class/dmi/id/board_name').write_text(board + '\n')
        (self.sys/'class/dmi/id/product_name').write_text(product + '\n')
    def apply(self, cmdline='quiet'):
        return nosleep['apply'](self.run, self.sys, cmdline)
    def test_cyan_skillfish_on_any_slot_blocks_every_sleep_mode(self):
        self.gpu('0000:00:01.0', '0x8086', '0x1234')
        self.gpu('0000:03:00.0', '0x1002', '0x13fe')
        self.assertTrue(self.apply())
        text = self.dropin.read_text()
        for key in ['AllowSuspend', 'AllowHibernation', 'AllowHybridSleep', 'AllowSuspendThenHibernate']:
            self.assertIn(f'\n{key}=no\n', text)
        self.assertTrue(text.split('\n[Sleep]\n')[0].startswith('#'))
        self.assertEqual(self.dropin.stat().st_mode & 0o777, 0o644)
        self.assertFalse(self.dropin.with_name(self.dropin.name + '.tmp').exists())
    def test_bc250_dmi_blocks_without_the_gpu(self):
        self.dmi('AMD BC-250', 'Default string')
        self.assertTrue(self.apply())
        (self.sys/'class/dmi/id/board_name').write_text('X\n')
        (self.sys/'class/dmi/id/product_name').write_text('AMD BC-250\n')
        self.assertTrue(self.apply())
    def test_other_amd_hardware_keeps_sleep(self):
        self.gpu('0000:01:00.0', '0x1002', '0x744c')
        self.dmi('ROG STRIX B650E-F', 'System Product Name')
        self.assertFalse(self.apply())
        self.assertFalse(self.dropin.exists())
    def test_similar_board_names_do_not_match(self):
        self.dmi('AMD BC-2500', 'BC-250')
        self.assertFalse(self.apply())
    def test_opt_out_removes_an_existing_block(self):
        self.gpu('0000:01:00.0', '0x1002', '0x13fe')
        self.assertTrue(self.apply())
        for cmdline in ['quiet naia.bc250.allow_sleep', 'naia.bc250.allow_sleep=1']:
            self.assertFalse(self.apply(cmdline))
            self.assertFalse(self.dropin.exists())
            self.assertTrue(self.apply())
    def test_unreadable_identity_is_skipped_not_fatal(self):
        (self.sys/'bus/pci/devices/0000:02:00.0').mkdir()
        self.gpu('0000:01:00.0', '0x1002', '0x13fe')
        self.assertTrue(self.apply())
    def test_rewrite_replaces_stale_content(self):
        self.gpu('0000:01:00.0', '0x1002', '0x13fe')
        self.dropin.parent.mkdir(parents=True)
        self.dropin.write_text('[Sleep]\nAllowSuspend=yes\n')
        self.assertTrue(self.apply())
        self.assertNotIn('AllowSuspend=yes', self.dropin.read_text())
    def test_unit_runs_before_logind_and_is_installed_in_usr(self):
        unit = (source/'naia-bc250-nosleep.service').read_text()
        self.assertIn('DefaultDependencies=no', unit)
        self.assertRegex(unit, r'Before=.*systemd-logind\.service')
        self.assertIn('WantedBy=sysinit.target', unit)
        installer = (source/'install-bc250.sh').read_text()
        self.assertIn('/usr/lib/systemd/system/sysinit.target.wants/naia-bc250-nosleep.service', installer)

class HardwareGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sys = self.root/'sys'
        self.dev = self.root/'dev'
        self.gpu = self.sys/'bus/pci/devices/0000:01:00.0'
        self.gpu.mkdir(parents=True)
        (self.gpu/'vendor').write_text('0x1002\n')
        (self.gpu/'device').write_text('0x13fe\n')
        driver = self.sys/'bus/pci/drivers/amdgpu'
        driver.mkdir(parents=True)
        (self.gpu/'driver').symlink_to(driver)
        for name in ['renderD128', 'card1']:
            card = self.sys/'class/drm'/name
            card.mkdir(parents=True)
            (card/'device').symlink_to(self.gpu)
        (self.dev/'dri').mkdir(parents=True)
        (self.dev/'dri/renderD128').touch()
        self.debug = self.sys/'kernel/debug/dri'
        (self.debug/'1').mkdir(parents=True)
        (self.debug/'1/amdgpu_regs').touch()
    def test_wrong_pci_ignored(self):
        (self.gpu/'device').write_text('0x744c')
        self.assertIsNone(audio['device'](self.sys,self.debug))
    def test_missing_driver_ignored(self):
        (self.gpu/'driver').unlink()
        self.assertIsNone(audio['device'](self.sys,self.debug))
    def test_voltage_controller_not_packaged(self):
        self.assertNotIn('governor', (source/'install-bc250.sh').read_text())
        self.assertFalse((source/'naia-bc250-governor.service').exists())
    def test_audio_uses_matching_card_not_first(self):
        (self.debug/'0').mkdir()
        (self.debug/'0/amdgpu_regs').touch()
        self.assertEqual(audio['device'](self.sys,self.debug),self.debug/'1/amdgpu_regs')
    def test_only_confirmed_bad_audio_signature(self):
        good=(0x00100010,240000,7286310,6000)
        self.assertEqual(audio['correction'](*good),6000000)
        for values in [(0,240000,7286310,6000),(0x10,240000,6000000,6000),
                       (0x10,240001,7286310,6000),(0x10,240000,7286310,6001),
                       (0xffffffff,0xffffffff,0xffffffff,0xffffffff)]:
            self.assertIsNone(audio['correction'](*values))
    def test_short_register_read_fails(self):
        with open(self.debug/'1/amdgpu_regs','rb') as stream:
            with self.assertRaises(OSError):
                audio['read'](stream.fileno(),0x16f)
    def test_recovery_never_opens_registers(self):
        for cmd in ['nomodeset','quiet naia.bc250.safe','naia.bc250.safe=1']:
            with mock.patch.object(Path,'read_text',return_value=cmd), mock.patch.object(os,'open',side_effect=AssertionError('register access forbidden')):
                self.assertEqual(audio['main'](),0)
    def test_main_identity_read_failure_enters_bounded_retry(self):
        g=audio['main'].__globals__
        retry=mock.Mock(return_value=1)
        with mock.patch.object(Path,'read_text',side_effect=['quiet',OSError('enumeration pending')]), mock.patch.dict(g,watch=retry):
            self.assertEqual(audio['main'](),1)
            retry.assert_called_once_with(Path('/sys'),Path('/sys/kernel/debug/dri'))
    def test_delayed_device_and_transient_reads_recover(self):
        g=audio['watch'].__globals__
        register=self.debug/'1/amdgpu_regs'
        with mock.patch.dict(g,device=mock.Mock(side_effect=[None,None,register,register,register]),correct_once=mock.Mock(side_effect=[OSError('reset'),None,KeyboardInterrupt()])), mock.patch.object(audio['time'],'sleep'):
            with self.assertRaises(KeyboardInterrupt):
                audio['watch'](self.sys,self.debug,max_failures=4)
            self.assertEqual(g['correct_once'].call_count,3)
    def test_retry_limit_is_bounded(self):
        g=audio['watch'].__globals__
        with mock.patch.dict(g,device=mock.Mock(return_value=None)), mock.patch.object(audio['time'],'sleep'):
            self.assertEqual(audio['watch'](self.sys,self.debug,max_failures=3),1)
            self.assertEqual(g['device'].call_count,3)
    def test_modeset_readback_requires_fresh_signature(self):
        g=audio['correct_once'].__globals__
        signature=[0x10,240000,7286310,6000]
        with mock.patch.dict(g,read=mock.Mock(side_effect=signature+signature+[7286310])), mock.patch.object(os,'pwrite',return_value=4) as write:
            with self.assertRaises(OSError):audio['correct_once'](123)
            write.assert_called_once_with(123,(6000000).to_bytes(4,'little'),0x16f*4)

if __name__=='__main__': unittest.main()
