import unittest
from device import validate_request, select_runner, profile_expiry
from datetime import datetime, timezone

class DeviceTests(unittest.TestCase):
    def test_coredevice_launch_denial_preserves_underlying_reason(self):
        from device import core_launch_error
        from pymobiledevice3.exceptions import CoreDeviceError
        inner = {'domain':'FBSOpenApplicationErrorDomain','code':3,'userInfo':{'BSErrorCodeDescription':'Security'}}
        error = CoreDeviceError('The application failed to launch.', code=10002,
                                user_info={'NSUnderlyingError':{'userInfo':{'NSUnderlyingError':inner}}})
        self.assertEqual(core_launch_error(error), 'developer-trust')
        inner['userInfo'] = {'BSErrorCodeDescription':'Locked'}
        self.assertEqual(core_launch_error(error), 'device-locked')
        self.assertEqual(core_launch_error(CoreDeviceError(code=10002)), 'launch-failed')
        self.assertIsNone(core_launch_error(CoreDeviceError(code=999)))
    def test_nested_launch_security_denial_is_not_generic_device_error(self):
        from types import SimpleNamespace
        from device import error_code
        error = Exception('Request to launch failed')
        inner = SimpleNamespace(domain='FBSOpenApplicationErrorDomain', code=3,
                                user_info={'BSErrorCodeDescription': 'Security'})
        error.error = SimpleNamespace(user_info={'NSUnderlyingError': inner})
        self.assertEqual(error_code(error), 'developer-trust')
        inner.user_info = {'BSErrorCodeDescription': 'Other'}
        self.assertEqual(error_code(error), 'device-error')
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


class StatusProbeTests(unittest.IsolatedAsyncioTestCase):
    async def test_usb_host_failure_cannot_authorize_replacing_the_runner(self):
        from device import wda_status
        from unittest.mock import AsyncMock, patch
        connection = 'pymobiledevice3.service_connection.ServiceConnection.create_using_usbmux'
        for failure in [TimeoutError(), ConnectionResetError()]:
            with self.subTest(failure=failure), patch(connection, new=AsyncMock(side_effect=failure)):
                status = await wda_status('01234567')
                self.assertEqual(status['availability'], 'unknown')
                self.assertFalse(status['unresponsive'])

    async def test_only_a_stalled_connected_port_with_no_response_is_recoverable(self):
        from device import wda_status
        from unittest.mock import AsyncMock, patch
        connection = 'pymobiledevice3.service_connection.ServiceConnection.create_using_usbmux'
        for reads, recoverable in [([TimeoutError()], True), ([b''], True),
                                   ([b'HTTP/1.1 401 Unauthorized\r\n', TimeoutError()], False),
                                   ([b'HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n'], False)]:
            with self.subTest(reads=reads):
                stream = AsyncMock()
                stream.__aenter__.return_value = stream
                stream.recv_any.side_effect = reads
                with patch(connection, new=AsyncMock(return_value=stream)):
                    status = await wda_status('01234567')
                self.assertEqual(status['availability'], 'unknown')
                self.assertEqual(status['unresponsive'], recoverable)


class RunnerLaunchTests(unittest.IsolatedAsyncioTestCase):
    async def run_launch(self, statuses, version='27.0', recovering=False):
        import device
        from unittest.mock import AsyncMock, patch
        process=AsyncMock()
        process.__aenter__.return_value=process
        from types import SimpleNamespace
        tunnel=AsyncMock();tunnel.__aenter__.return_value=SimpleNamespace(product_version=version)
        dvt=AsyncMock();dvt.__aenter__.return_value=object()
        with patch('pymobiledevice3.remote.core_device.app_service.AppServiceService',return_value=process), patch('pymobiledevice3.remote.userspace_tunnel.UserspaceRsdTunnel',return_value=tunnel), patch('pymobiledevice3.services.dvt.instruments.dvt_provider.DvtProvider',return_value=dvt), patch('pymobiledevice3.services.dvt.instruments.process_control.ProcessControl',return_value=process), patch('device.wda_status',new=AsyncMock(side_effect=statuses)), patch('device.asyncio.sleep',new=AsyncMock()):
            try: result=await device.start_runner('01234567','runner',recovering)
            except Exception as e: result=e
        return result,process

    async def test_ios26_waits_for_phone_auth_without_replacing_the_process(self):
        absent={'availability':'absent','ready':False,'busy':False}
        result,process=await self.run_launch([absent]*45+[{'ready':True,'runnerBundleId':'runner'}], '26.4.2')
        self.assertTrue(result['ready'])
        process.launch_application.assert_awaited_once_with('runner',kill_existing=False,environment={'USE_IP':'127.0.0.1','USE_PORT':'8100'})

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

    async def test_recovery_replaces_only_after_repeated_transport_failures(self):
        stalled = {'availability':'unknown','ready':False,'busy':False,'unresponsive':True}
        ready = {'availability':'available','ready':True,'busy':False,'runnerBundleId':'runner'}
        result, process = await self.run_launch([stalled]*3+[ready], '26.4', recovering=True)
        self.assertTrue(result['ready'])
        process.launch_application.assert_awaited_once_with('runner', kill_existing=True,
            environment={'USE_IP':'127.0.0.1','USE_PORT':'8100'})

    async def test_recovery_abandons_replacement_if_status_changes(self):
        stalled = {'availability':'unknown','ready':False,'busy':False,'unresponsive':True}
        ready = {'availability':'available','ready':True,'busy':False,'runnerBundleId':'runner'}
        for final in [ready, {**ready,'busy':True}, {**ready,'runnerBundleId':'foreign'},
                      {**stalled,'unresponsive':False}]:
            result, process = await self.run_launch([stalled, final], recovering=True)
            process.launch.assert_not_awaited()
            if final == ready: self.assertTrue(result['ready'])
            else: self.assertIsInstance(result,ValueError)

    async def test_wrong_bundle_after_launch_is_not_ready(self):
        result,_=await self.run_launch([{'availability':'absent','ready':False,'busy':False},{'availability':'available','ready':True,'busy':False,'runnerBundleId':'foreign'}])
        self.assertIsInstance(result,ValueError)
        self.assertEqual(str(result),'runner-mismatch')

    async def test_foreign_session_acquired_during_launch_is_busy(self):
        absent = {'availability':'absent','ready':False,'busy':False}
        occupied = {'availability':'available','ready':True,'busy':True,'runnerBundleId':'runner'}
        result, _ = await self.run_launch([absent, occupied])
        self.assertIsInstance(result, ValueError)
        self.assertEqual(str(result), 'busy')

if __name__=='__main__': unittest.main()
