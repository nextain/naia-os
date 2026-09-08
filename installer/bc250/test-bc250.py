import os, runpy, tempfile, unittest
from pathlib import Path

source = Path(__file__).resolve().parent
governor = runpy.run_path(str(source/'naia-bc250-governor'))
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
    def test_initialized_bc250(self):
        self.assertTrue(governor['ready'](self.sys,self.dev,'quiet'))
    def test_recovery_disables_gpu_mutation(self):
        for cmd in ['nomodeset','quiet naia.bc250.safe','naia.bc250.safe=1']:
            self.assertFalse(governor['ready'](self.sys,self.dev,cmd))
    def test_wrong_pci_ignored(self):
        (self.gpu/'device').write_text('0x744c')
        self.assertFalse(governor['ready'](self.sys,self.dev,''))
        self.assertIsNone(audio['device'](self.sys,self.debug))
    def test_missing_driver_ignored(self):
        (self.gpu/'driver').unlink()
        self.assertFalse(governor['ready'](self.sys,self.dev,''))
    def test_missing_render_node_ignored(self):
        (self.dev/'dri/renderD128').unlink()
        self.assertFalse(governor['ready'](self.sys,self.dev,''))
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

if __name__=='__main__': unittest.main()
