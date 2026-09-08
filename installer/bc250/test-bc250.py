import os, runpy, tempfile, unittest
from unittest import mock
from pathlib import Path

source = Path(__file__).resolve().parent
audio = runpy.run_path(str(source/'naia-bc250-dp-audio'))

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
