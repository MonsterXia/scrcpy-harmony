import unittest
from device import validate_request, select_runner, profile_expiry
from datetime import datetime, timezone

class DeviceTests(unittest.TestCase):
    def test_exact_target_and_command(self):
        for r in ({'op':'shell','udid':'01234567'}, {'op':'start','udid':'all'}, {'op':'start','udid':'01234567','bundleId':'com.other.app'}):
            with self.assertRaises(ValueError): validate_request(r)
        validate_request({'op':'inspect','udid':'01234567','bundleId':'io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.TEAM123456'})
    def test_only_expected_runner_selected(self):
        bid='io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.TEAM123456'
        self.assertEqual(select_runner({bid:{}},bid),bid)
        self.assertIsNone(select_runner({'com.other.app':{}},bid))
        self.assertIsNone(select_runner({bid:{}},'io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.OTHER12345'))
    def test_expiry_requires_device_and_exact_application(self):
        bid='io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.TEAM123456'
        p={'Entitlements':{'application-identifier':'TEAM123456.'+bid},'ProvisionedDevices':['01234567'],'ExpirationDate':datetime(2026,11,24,tzinfo=timezone.utc)}
        self.assertIsNotNone(profile_expiry([p],bid,'01234567'))
        self.assertIsNone(profile_expiry([p],bid,'01234568'))
        p['Entitlements']['application-identifier']='TEAM123456.*'
        self.assertIsNone(profile_expiry([p],bid,'01234567'))
class DeveloperImageTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_developer_image_does_not_block_startup(self):
        import device
        from unittest.mock import AsyncMock, patch
        from pymobiledevice3.exceptions import AlreadyMountedError
        with patch('pymobiledevice3.services.mobile_image_mounter.auto_mount', new=AsyncMock(side_effect=AlreadyMountedError())):
            await device.ensure_developer_image(object())

    async def test_other_mount_failures_still_block_startup(self):
        import device
        from unittest.mock import AsyncMock, patch
        with patch('pymobiledevice3.services.mobile_image_mounter.auto_mount', new=AsyncMock(side_effect=RuntimeError('mount failed'))):
            with self.assertRaisesRegex(RuntimeError, 'mount failed'):
                await device.ensure_developer_image(object())


class RunnerLaunchTests(unittest.IsolatedAsyncioTestCase):
    async def run_launch(self, statuses):
        import device
        from unittest.mock import AsyncMock, patch
        process=AsyncMock()
        process.__aenter__.return_value=process
        tunnel=AsyncMock();tunnel.__aenter__.return_value=object()
        dvt=AsyncMock();dvt.__aenter__.return_value=object()
        with patch('pymobiledevice3.remote.userspace_tunnel.UserspaceRsdTunnel',return_value=tunnel), patch('pymobiledevice3.services.dvt.instruments.dvt_provider.DvtProvider',return_value=dvt), patch('pymobiledevice3.services.dvt.instruments.process_control.ProcessControl',return_value=process), patch('device.wda_status',new=AsyncMock(side_effect=statuses)), patch('device.asyncio.sleep',new=AsyncMock()):
            try: result=await device.start_runner('01234567','runner')
            except Exception as e: result=e
        return result,process

    async def test_background_launch_preserves_existing_process_and_exact_bundle(self):
        result,process=await self.run_launch([{'availability':'absent','ready':False,'busy':False},{'availability':'available','ready':True,'busy':False,'runnerBundleId':'runner'}])
        self.assertNotIsInstance(result,Exception)
        process.launch.assert_awaited_once_with('runner',kill_existing=False,environment={'USE_IP':'127.0.0.1','USE_PORT':'8100'},extra_options={'ActivateSuspended':True})
        self.assertTrue(result['ready'])

    async def test_unknown_or_busy_status_never_launches(self):
        for status in [{'availability':'unknown','ready':False,'busy':False},{'availability':'available','ready':True,'busy':True,'runnerBundleId':'runner'}]:
            result,process=await self.run_launch([status])
            self.assertIsInstance(result,ValueError)
            process.launch.assert_not_awaited()

    async def test_wrong_bundle_after_launch_is_not_ready(self):
        result,_=await self.run_launch([{'availability':'absent','ready':False,'busy':False},{'availability':'available','ready':True,'busy':False,'runnerBundleId':'foreign'}])
        self.assertIsInstance(result,ValueError)
        self.assertEqual(str(result),'runner-mismatch')

if __name__=='__main__': unittest.main()
