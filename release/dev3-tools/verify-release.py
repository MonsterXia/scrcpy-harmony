"""Read-only verification: fixed numeric release ID, immutable tag, exact assets and full re-download."""
import concurrent.futures,json,subprocess,sys
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('fetch',Path(__file__).with_name('fetch-artifacts.py'));h=module_from_spec(spec);spec.loader.exec_module(h)
cfg=json.loads(Path(sys.argv[1]).read_text());root=Path(cfg['root']).resolve()
manifest=json.loads((root/'publication-manifest.json').read_text())
require=h.require;api=h.api;repo=h.REPO;tag='v'+h.VERSION
release_id=int(sys.argv[2]);mode=sys.argv[3]
require(mode in ('draft','published'),'Invalid verification mode')
require(manifest['sourceCommit']==cfg['source'] and manifest['version']==h.VERSION and manifest['repository']==repo,'Manifest identity differs')
ref=api('git/ref/tags/'+tag);require(ref['object']['type']=='commit' and ref['object']['sha']==cfg['source'],'Tag differs')
r=api(f'releases/{release_id}')
require(r['id']==release_id and r['tag_name']==tag and r['name']=='Scrcpy Plus '+h.VERSION and r['prerelease'] and r['draft']==(mode=='draft'),'Release identity/state differs')
require(api('releases/latest')['tag_name']=='v1.0.4','Stable Latest changed')
assets=api(f'releases/{release_id}/assets?per_page=100')
expected={f['name']:f for f in manifest['files']}
require(len(expected)==12 and len(assets)==12 and {a['name'] for a in assets}==set(expected),'Release asset set differs')
for a in assets:
 f=expected[a['name']];require(a['state']=='uploaded' and a['size']==f['size'] and a.get('digest')=='sha256:'+f['sha256'],'Remote asset digest differs: '+a['name'])
download=root/('remote-'+mode);download.mkdir(exist_ok=True)
def verify(a):
 f=expected[a['name']];path=download/a['name']
 if not path.exists():
  part=path.with_suffix(path.suffix+'.part')
  try:
   with part.open('wb') as out:subprocess.run(['gh','api',f"repos/{repo}/releases/assets/{a['id']}",'-H','Accept: application/octet-stream'],stdout=out,check=True)
   require(part.stat().st_size==f['size'] and h.digest(part)==f['sha256'],'Downloaded bytes differ: '+a['name']);part.rename(path)
  finally:part.unlink(missing_ok=True)
 require(path.stat().st_size==f['size'] and h.digest(path)==f['sha256'],'Cached download differs')
 print(a['name']+': verified',flush=True)
 return {'name':a['name'],'id':a['id'],'size':f['size'],'sha256':f['sha256']}
if mode=='draft':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:checked=list(pool.map(verify,assets))
else:
 previous=json.loads((root/'audit-draft.json').read_text())
 h.verify_draft_identity(previous,assets,release_id,cfg['source'])
 checked=previous['downloadedAndVerified']
# Recheck state and digests after all transfers; never publish inside this verifier.
now=api(f'releases/{release_id}');require(now['tag_name']==tag and now['draft']==r['draft'] and now['prerelease'],'Release changed during verification')
current=api(f'releases/{release_id}/assets?per_page=100')
require(sorted((a['id'],a['name'],a['digest'],a['size']) for a in current)==sorted((a['id'],a['name'],a['digest'],a['size']) for a in assets),'Assets changed during verification')
require(api('git/ref/tags/'+tag)['object']['sha']==cfg['source'],'Tag moved during verification')
require(api('releases/latest')['tag_name']=='v1.0.4','Stable Latest changed during verification')
from datetime import datetime,timezone
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'releaseId':release_id,'url':r['html_url'],'sourceCommit':cfg['source'],'tag':tag,'draft':r['draft'],'prerelease':r['prerelease'],'latestStable':'v1.0.4','mode':mode,'downloadedAndVerified':checked,'passed':True}
if mode=='published':
 report['verificationMethod']='metadata readback against fixed IDs from full draft download'
 report['draftDownloadVerifiedAt']=previous['checkedAt']
(root/('audit-'+mode+'.json')).write_text(json.dumps(report,indent=2)+'\n')
print('Release verification passed: '+mode)
