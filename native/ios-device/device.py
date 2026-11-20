"""Private stdio device helper. No arbitrary command, path, port or executable inputs."""
import asyncio
import json
import logging
import re
import sys
from datetime import timezone

PREFIX = 'io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.'

def validate_request(r):
    if not isinstance(r, dict) or r.get('op') not in ('inspect', 'start', 'recover'):
        raise ValueError('protocol')
    if not isinstance(r.get('udid'), str) or not re.fullmatch(r'[a-fA-F0-9-]{8,64}', r['udid']):
        raise ValueError('protocol')
    bid = r.get('bundleId')
    if bid is not None and (not isinstance(bid, str) or not re.fullmatch(re.escape(PREFIX)+r'[A-Z0-9]{10}', bid)):
        raise ValueError('protocol')
    if r['op'] in ('start','recover') and not bid:
        raise ValueError('protocol')

def select_runner(apps, expected):
    return expected if expected and expected in apps else None

def profile_expiry(profiles, bid, udid):
    dates = []
    for p in profiles:
        aid = p.get('Entitlements', {}).get('application-identifier', '')
        if aid.partition('.')[2] != bid or udid not in p.get('ProvisionedDevices', []):
            continue
        dt = p.get('ExpirationDate')
        if dt is not None:
            dates.append(int(dt.replace(tzinfo=timezone.utc).timestamp()*1000))
    return max(dates) if dates else None

def emit(value):
    print(json.dumps(value, separators=(',', ':')), flush=True)

async def wda_status(udid):
    from pymobiledevice3.service_connection import ServiceConnection
    waiting_for_first_byte = False
    async def read():
        nonlocal waiting_for_first_byte
        async with await ServiceConnection.create_using_usbmux(udid, 8100, connection_type='USB') as c:
            waiting_for_first_byte = True
            await c.sendall(b'GET /status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
            data = b''
            while len(data) < 1024*1024:
                part = await c.recv_any()
                if not part: break
                waiting_for_first_byte = False
                data += part
                if b'\r\n\r\n' in data:
                    header, body = data.split(b'\r\n\r\n',1)
                    lengths = [int(x.split(b':',1)[1]) for x in header.split(b'\r\n') if x.lower().startswith(b'content-length:')]
                    if lengths and len(body) >= lengths[0]: break
            if not data: raise EOFError('empty response')
            header, body = data.split(b'\r\n\r\n',1)
            if not header.startswith(b'HTTP/1.1 200'): raise ValueError('status')
            if not body: raise EOFError('empty status')
            result = json.loads(body)
            value = result.get('value', {})
            return {'ready': value.get('ready') is True and value.get('scrcpyPlusProtocolVersion') == 1,
                    'busy': bool(result.get('sessionId')), 'runnerBundleId':value.get('scrcpyPlusBundleId'), 'reachable': True, 'availability': 'available'}
    try: return await asyncio.wait_for(read(), 5)
    except Exception as e:
        from pymobiledevice3.exceptions import ConnectionFailedError, ConnectionTerminatedError
        return {'ready':False, 'busy':False, 'reachable':False, 'availability':'absent' if type(e) is ConnectionFailedError else 'unknown',
                'unresponsive': waiting_for_first_byte and isinstance(e, (TimeoutError, EOFError, ConnectionResetError, BrokenPipeError, ConnectionTerminatedError))}

async def ensure_developer_image(lockdown):
    from pymobiledevice3.services.mobile_image_mounter import auto_mount
    from pymobiledevice3.exceptions import AlreadyMountedError
    try:
        await auto_mount(lockdown)
    except AlreadyMountedError:
        # Keep the existing image: replacing it interrupts its active services.
        pass

async def operate(r):
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.services.installation_proxy import InstallationProxyService
    from pymobiledevice3.services.misagent import MisagentService
    from pymobiledevice3.services.mobile_image_mounter import MobileImageMounterService
    async with await create_using_usbmux(serial=r['udid'], connection_type='USB', autopair=False) as lockdown:
        async with InstallationProxyService(lockdown) as proxy:
            apps = await proxy.lookup({'ApplicationType':'User'}) or {}
        bid = select_runner(apps, r.get('bundleId'))
        expires = None
        if bid:
            async with MisagentService(lockdown) as profiles:
                expires = profile_expiry([x.plist for x in await profiles.copy_all()],bid,r['udid'])
        async with MobileImageMounterService(lockdown) as mounter:
            mode = await mounter.query_developer_mode_status()
        status = await wda_status(r['udid'])
        if status['ready'] and status.get('runnerBundleId') != r.get('bundleId'):
            status = {**status, 'ready':False, 'availability':'unknown'}
        result = {**status, 'installed':bool(bid), 'expiresAt':expires, 'developerMode':bool(mode)}
        if r['op'] == 'inspect': return result
        recovering = r['op'] == 'recover'
        if status['availability'] == 'unknown' and not (recovering and status.get('unresponsive')): raise ValueError('status-unknown')
        if status['busy']: raise ValueError('busy')
        if status['ready']: return result
        if not bid: raise ValueError('not-installed')
        if not mode: raise ValueError('developer-mode')
        emit({'event':'phase','phase':'mounting'})
        await ensure_developer_image(lockdown)
    emit({'event':'phase','phase':'starting'})
    return {**result, **await start_runner(r['udid'], bid, recovering)}

async def start_runner(udid, bid, recovering=False):
    from pymobiledevice3.remote.userspace_tunnel import UserspaceRsdTunnel
    async with UserspaceRsdTunnel(serial=udid,autopair=False,remotepairing_fallback=False) as rsd:
        status = await wda_status(udid)
        for attempt in range(3 if recovering else 1):
            if (status.get('reachable') or status['ready']) and status.get('runnerBundleId') != bid: raise ValueError('runner-mismatch')
            if status['busy']: raise ValueError('busy')
            if status['ready']: return status
            if status['availability'] != 'absent' and not (recovering and status.get('unresponsive')):
                raise ValueError('status-unknown')
            if recovering and attempt < 2:
                await asyncio.sleep(1)
                status = await wda_status(udid)
        environment = {'USE_IP':'127.0.0.1','USE_PORT':'8100'}
        if rsd.product_version.split('.')[0] == '26':
            from pymobiledevice3.exceptions import CoreDeviceError
            from pymobiledevice3.remote.core_device.app_service import AppServiceService
            async with AppServiceService(rsd) as service:
                try:
                    await service.launch_application(bid, kill_existing=recovering, environment=environment)
                except CoreDeviceError as error:
                    reason = core_launch_error(error)
                    if reason: raise ValueError(reason) from error
                    raise
        else:
            from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
            from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
            async with DvtProvider(rsd) as dvt, ProcessControl(dvt) as process:
                await process.launch(bid, kill_existing=recovering, environment=environment, extra_options={'ActivateSuspended':True})
        deadline = asyncio.get_running_loop().time() + 90
        while asyncio.get_running_loop().time() < deadline:
            status = await wda_status(udid)
            if (status.get('reachable') or status['ready']) and status.get('runnerBundleId') != bid: raise ValueError('runner-mismatch')
            if status.get('busy'): raise ValueError('busy')
            if status['ready']: return status
            await asyncio.sleep(.5)
        raise ValueError('start-timeout')

def core_launch_error(error):
    if error.code != 10002: return None
    info = error.user_info
    for _ in range(8):
        if not isinstance(info, dict): break
        reason = info.get('BSErrorCodeDescription')
        detail = str(info.get('NSLocalizedFailureReason', '')).lower()
        if reason == 'Security' or 'not been explicitly trusted' in detail: return 'developer-trust'
        if reason == 'Locked' or 'device is locked' in detail: return 'device-locked'
        inner = info.get('NSUnderlyingError')
        if not isinstance(inner, dict): break
        info = inner.get('userInfo', inner)
    return 'launch-failed'

def error_code(e):
    if isinstance(e, ValueError) and str(e) in ('protocol','runner-mismatch','status-unknown','busy','not-installed','developer-mode','start-timeout','developer-trust','device-locked','launch-failed'): return str(e)
    cause = getattr(e, 'error', None)
    for _ in range(8):
        info = getattr(cause, 'user_info', None)
        if not isinstance(info, dict): break
        if getattr(cause, 'domain', None) == 'FBSOpenApplicationErrorDomain' and info.get('BSErrorCodeDescription') == 'Security':
            return 'developer-trust'
        cause = info.get('NSUnderlyingError')
    text = str(e).lower()
    if 'security' in text or 'not been explicitly trusted' in text: return 'developer-trust'
    if 'locked' in text: return 'device-locked'
    if 'notpaired' in type(e).__name__.lower() or 'pair' in text: return 'trust-computer'
    if isinstance(e, TimeoutError): return 'timeout'
    return 'device-error'

def main():
    logging.disable(logging.CRITICAL)
    try:
        raw = sys.stdin.buffer.readline(65537)
        if len(raw)>65536: raise ValueError('protocol')
        r=json.loads(raw); validate_request(r)
        result=asyncio.run(asyncio.wait_for(operate(r),240))
        emit({'result':result})
    except Exception as e:
        emit({'error':error_code(e), 'category':type(e).__name__, **({'module':e.name} if isinstance(e, ModuleNotFoundError) else {})})
        sys.exit(1)

if __name__ == '__main__': main()
