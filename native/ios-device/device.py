"""Private stdio device helper. No arbitrary command, path, port or executable inputs."""
import asyncio
import json
import logging
import re
import sys
from datetime import timezone

PREFIX = 'io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner.'

def validate_request(r):
    if not isinstance(r, dict) or r.get('op') not in ('inspect', 'start'):
        raise ValueError('protocol')
    if not isinstance(r.get('udid'), str) or not re.fullmatch(r'[a-fA-F0-9-]{8,64}', r['udid']):
        raise ValueError('protocol')
    bid = r.get('bundleId')
    if bid is not None and (not isinstance(bid, str) or not re.fullmatch(re.escape(PREFIX)+r'[A-Z0-9]{10}', bid)):
        raise ValueError('protocol')
    if r['op'] == 'start' and not bid:
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
    async def read():
        async with await ServiceConnection.create_using_usbmux(udid, 8100, connection_type='USB') as c:
            await c.sendall(b'GET /status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
            data = b''
            while len(data) < 1024*1024:
                part = await c.recv_any()
                if not part: break
                data += part
                if b'\r\n\r\n' in data:
                    header, body = data.split(b'\r\n\r\n',1)
                    lengths = [int(x.split(b':',1)[1]) for x in header.split(b'\r\n') if x.lower().startswith(b'content-length:')]
                    if lengths and len(body) >= lengths[0]: break
            header, body = data.split(b'\r\n\r\n',1)
            if not header.startswith(b'HTTP/1.1 200'): raise ValueError('status')
            result = json.loads(body)
            value = result.get('value', {})
            return {'ready': value.get('ready') is True and value.get('scrcpyPlusProtocolVersion') == 1,
                    'busy': bool(result.get('sessionId')), 'runnerBundleId':value.get('scrcpyPlusBundleId'), 'reachable': True, 'availability': 'available'}
    try: return await asyncio.wait_for(read(), 5)
    except Exception as e:
        from pymobiledevice3.exceptions import ConnectionFailedError
        return {'ready':False, 'busy':False, 'reachable':False, 'availability':'absent' if type(e) is ConnectionFailedError else 'unknown'}

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
        if status['availability'] == 'unknown': raise ValueError('status-unknown')
        if status['busy']: raise ValueError('busy')
        if status['ready']: return result
        if not bid: raise ValueError('not-installed')
        if not mode: raise ValueError('developer-mode')
        emit({'event':'phase','phase':'mounting'})
        await ensure_developer_image(lockdown)
    emit({'event':'phase','phase':'starting'})
    return {**result, **await start_runner(r['udid'], bid)}

async def start_runner(udid, bid):
    from pymobiledevice3.remote.userspace_tunnel import UserspaceRsdTunnel
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
    async with UserspaceRsdTunnel(serial=udid,autopair=False,remotepairing_fallback=False) as rsd:
        async with DvtProvider(rsd) as dvt, ProcessControl(dvt) as process:
            # Recheck after mount/tunnel setup; never replace another client's process.
            status = await wda_status(udid)
            if status['availability'] == 'unknown': raise ValueError('status-unknown')
            if status['busy']: raise ValueError('busy')
            if status['ready'] and status.get('runnerBundleId') != bid: raise ValueError('runner-mismatch')
            if status['ready']: return status
            # XCTest Runners must activate in the background with newer developer
            # images. A foreground CoreDevice launch can leave HTTP unstarted.
            # ActivateSuspended is distinct from StartSuspendedKey (debugger wait).
            await process.launch(bid, kill_existing=False,
                environment={'USE_IP':'127.0.0.1','USE_PORT':'8100'},
                extra_options={'ActivateSuspended':True})
            for _ in range(40):
                status = await wda_status(udid)
                if status['ready'] and status.get('runnerBundleId') != bid: raise ValueError('runner-mismatch')
                if status['ready']: return status
                await asyncio.sleep(.5)
            raise ValueError('start-timeout')

def error_code(e):
    if isinstance(e, ValueError) and str(e) in ('protocol','runner-mismatch','status-unknown','busy','not-installed','developer-mode','start-timeout'): return str(e)
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
