from importlib import metadata
from pathlib import Path
import sys
out=['Python device helper dependency notices\n']
for d in sorted(metadata.distributions(),key=lambda d:d.metadata.get('Name','')):
    out.append('\n'+d.metadata.get('Name','')+' '+d.version+'\n')
    out.append(d.metadata.get('License-Expression',d.metadata.get('License',''))+'\n')
    for f in d.files or []:
        p=Path(f)
        if p.name.upper().startswith(('LICENSE','COPYING','NOTICE')):
            absolute=Path(d.locate_file(f))
            if absolute.is_file(): out.append(absolute.read_text(encoding='utf-8', errors='replace')+'\n')
out.append('\nPython runtime license\n')
for p in [Path(sys.base_prefix)/'LICENSE.txt',Path(sys.base_prefix)/'lib/python3.13/LICENSE.txt']:
    if p.exists(): out.append(p.read_text(encoding='utf-8', errors='replace'))
Path(sys.argv[1]).write_text(''.join(out), encoding='utf-8')
