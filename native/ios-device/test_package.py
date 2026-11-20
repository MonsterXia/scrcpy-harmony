import tempfile, unittest, plistlib, zipfile
from pathlib import Path
from package_wda import package
class PackageTests(unittest.TestCase):
    def test_unsigned_archive_is_clean_and_nested_test_id_is_rewritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); app=p/'Runner.app'; test=app/'PlugIns'/'WebDriverAgentRunner.xctest'; test.mkdir(parents=True)
            for folder,bid in ((app,'io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner'),(test,'io.scrcpyplus.unsigned.WebDriverAgentRunner')):
                (folder/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':bid}))
            (app/'._junk').write_text('metadata')
            for framework in ('XCTestCore', 'AppSupport'):
                folder = app/'Frameworks'/(framework+'.framework')
                folder.mkdir(parents=True)
                (folder/framework).write_bytes(b'fixture')
            output=p/'test.ipa'; package(app,output)
            with zipfile.ZipFile(output) as z:
                self.assertFalse(any('/._' in n for n in z.namelist()))
                self.assertFalse(any('Frameworks/XCTestCore.framework/' in n for n in z.namelist()))
                self.assertIn('Payload/Runner.app/Frameworks/AppSupport.framework/AppSupport', z.namelist())
                info=plistlib.loads(z.read('Payload/Runner.app/PlugIns/WebDriverAgentRunner.xctest/Info.plist'))
                self.assertTrue(info['CFBundleIdentifier'].endswith('.xctrunner.tests'))
            (app/'embedded.mobileprovision').write_text('private')
            with self.assertRaises(ValueError): package(app,output)
if __name__=='__main__':unittest.main()
