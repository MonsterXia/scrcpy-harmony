"""Prepare redistributable unsigned WDA input. Never include local signing profiles."""
import plistlib, stat, sys, zipfile
from pathlib import Path

def package(app, output):
    app=Path(app); output=Path(output)
    files=sorted(app.rglob('*'))
    if any(p.name=='embedded.mobileprovision' for p in files): raise ValueError('Input must be unsigned')
    info=plistlib.loads((app/'Info.plist').read_bytes())
    if info['CFBundleIdentifier']!='io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner': raise ValueError('Unexpected WDA bundle')
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
        for p in files:
            relative=p.relative_to(app)
            if relative.match('Frameworks/XC*.framework') or (
                len(relative.parts) >= 3 and relative.parts[0] == 'Frameworks'
                and relative.parts[1].startswith('XC') and relative.parts[1].endswith('.framework')
            ): continue
            if p.is_symlink(): raise ValueError('WDA symlink is not allowed')
            if not p.is_file() or any(x.startswith('._') or x in ('__MACOSX','_CodeSignature') for x in relative.parts): continue
            data=p.read_bytes()
            if relative.as_posix()=='PlugIns/WebDriverAgentRunner.xctest/Info.plist':
                test=plistlib.loads(data); test['CFBundleIdentifier']=info['CFBundleIdentifier']+'.tests'; data=plistlib.dumps(test)
            entry=zipfile.ZipInfo('Payload/'+app.name+'/'+relative.as_posix(),(2026,1,1,0,0,0))
            entry.create_system=3; entry.external_attr=(stat.S_IFREG|stat.S_IMODE(p.stat().st_mode))<<16
            entry.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(entry,data)
if __name__=='__main__': package(sys.argv[1],sys.argv[2])
