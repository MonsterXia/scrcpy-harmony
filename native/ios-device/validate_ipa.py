import plistlib, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    names=z.namelist()
    for n in names:
        if n.startswith('Payload/WebDriverAgentRunner-Runner.app/Frameworks/XC') and n.split('/')[3].endswith('.framework'):
            raise ValueError('Preinstalled WDA must use on-device XCTest frameworks')
        if n.startswith('/') or '..' in n.split('/') or any(p.startswith('._') or p=='__MACOSX' for p in n.split('/')) or n.endswith('embedded.mobileprovision'):
            raise ValueError('Unsafe or signed WDA archive')
    info=plistlib.loads(z.read('Payload/WebDriverAgentRunner-Runner.app/Info.plist'))
    if info['CFBundleIdentifier']!='io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner': raise ValueError('Unexpected Runner')
    test=plistlib.loads(z.read('Payload/WebDriverAgentRunner-Runner.app/PlugIns/WebDriverAgentRunner.xctest/Info.plist'))
    if test['CFBundleIdentifier']!=info['CFBundleIdentifier']+'.tests': raise ValueError('Unexpected XCTest bundle')
    if not any(n.endswith('WebDriverAgentBroadcast.appex/Info.plist') for n in names): raise ValueError('Missing broadcast extension')
