"""Read-only, source-pinned artifact download and ZIP verification for dev.3."""
import concurrent.futures, hashlib, json, shutil, stat, subprocess, sys, zipfile
from pathlib import Path, PurePosixPath
REPO='MonsterXia/scrcpy-plus'; VERSION='1.0.5-dev.3'

def require(value, message):
    if not value: raise RuntimeError(message)

def api(endpoint):
    return json.loads(subprocess.check_output(['gh','api',f'repos/{REPO}/{endpoint}']))

def digest(file):
    h=hashlib.sha256()
    with Path(file).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def extract(archive, dest, expected):
    require(not dest.exists(),'Extraction directory must be new')
    with zipfile.ZipFile(archive) as zipped:
        entries=zipped.infolist();require(len(entries)<=40 and sum(e.file_size for e in entries)<2*1024**3,'ZIP limits exceeded')
        files=set();seen=set()
        for e in entries:
            name=e.orig_filename;parts=name.rstrip('/').split('/')
            require(name and '\\' not in name and '\x00' not in name and ':' not in name and not PurePosixPath(name).is_absolute() and all(p not in ('','.','..') for p in parts),'Unsafe ZIP path')
            require(name.casefold() not in seen,'Duplicate ZIP entry');seen.add(name.casefold())
            kind=stat.S_IFMT(e.external_attr>>16)
            require(kind in (0,stat.S_IFREG,stat.S_IFDIR) and not e.flag_bits&1,'Unsafe ZIP type')
            if e.is_dir():require(name.rstrip('/')==VERSION and kind!=stat.S_IFREG,'Unexpected ZIP directory')
            else:
                require(kind!=stat.S_IFDIR and len(parts)==2 and parts[0]==VERSION and parts[1] in expected,'Unexpected ZIP file')
                require(e.file_size>0,'Empty ZIP file');files.add(parts[1])
        require(files==expected,'Missing artifact files')
        dest.mkdir(parents=True)
        for e in entries:
            if e.is_dir():continue
            target=dest/e.filename;target.parent.mkdir(exist_ok=True)
            with zipped.open(e) as src,target.open('xb') as out:shutil.copyfileobj(src,out)

def verify_draft_identity(previous, assets, release_id, source):
    require(previous.get('passed') is True and previous.get('draft') is True and previous.get('mode')=='draft', 'Draft download audit required')
    require(previous['releaseId']==release_id and previous['sourceCommit']==source and previous['tag']=='v'+VERSION, 'Draft audit identity differs')
    expected=sorted((a['id'],a['name'],a['size'],a['sha256']) for a in previous['downloadedAndVerified'])
    actual=sorted((a['id'],a['name'],a['size'],a['digest'].removeprefix('sha256:')) for a in assets)
    require(actual==expected, 'Published assets differ from downloaded draft assets')

def main():
    cfg=json.loads(Path(sys.argv[1]).read_text());source=cfg['source'];run_id=cfg['run'];root=Path(cfg['root']).resolve()
    require(len(source)==40 and all(c in '0123456789abcdef' for c in source),'Invalid source SHA')
    run=api(f'actions/runs/{run_id}')
    require(run['name']=='Release Build' and run['event']=='workflow_dispatch' and run['head_branch']=='master' and run['head_sha']==source and run['conclusion']=='success' and run['status']=='completed','Wrong or unsuccessful release build')
    require(run['repository']['full_name']==REPO and run['head_repository']['full_name']==REPO,'Wrong repository')
    pr=api('pulls/102');require(pr['merged'] and pr['merge_commit_sha']==source,'Release source differs from merged preparation PR')
    jobs=api(f'actions/runs/{run_id}/jobs')['jobs'];require({j['name'] for j in jobs}=={'release-source','ios-wda / wda','macos-release','windows-release'} and all(j['conclusion']=='success' for j in jobs),'Release jobs incomplete')
    artifacts=api(f'actions/runs/{run_id}/artifacts')['artifacts']
    require({a['name'] for a in artifacts}=={'unsigned-wda','macos-release-arm64','windows-release-x64'},'Unexpected artifact set')
    required={
        'windows-release-x64':{f'Scrcpy Plus-{VERSION}-win-x64.exe',f'Scrcpy Plus-{VERSION}-win-x64.exe.blockmap','latest.yml','verification-win-x64.json'},
        'macos-release-arm64':{f'Scrcpy Plus-{VERSION}-mac-arm64.dmg',f'Scrcpy Plus-{VERSION}-mac-arm64.dmg.blockmap','latest-mac.yml','verification-mac-arm64.json','verification-notary-mac-arm64.json',f'scrcpy-plus-cli-{VERSION}.tgz'},
    }
    root.mkdir(parents=True,exist_ok=True)
    def fetch(a):
        require(not a['expired'] and a['workflow_run']['head_sha']==source,'Expired or wrong-source artifact')
        require(a.get('digest','').startswith('sha256:') and len(a['digest'])==71,'Missing artifact digest')
        archive=root/(a['name']+'.zip')
        if not archive.exists():
            part=archive.with_suffix('.zip.part')
            try:
                with part.open('wb') as out:subprocess.run(['gh','api',f"repos/{REPO}/actions/artifacts/{a['id']}/zip"],stdout=out,check=True)
                require('sha256:'+digest(part)==a['digest'],'ZIP hash mismatch');part.rename(archive)
            finally:part.unlink(missing_ok=True)
        require('sha256:'+digest(archive)==a['digest'],'Cached ZIP hash mismatch')
        dest=root/a['name']
        extract(archive,dest,required[a['name']])
        print(a['name']+': downloaded and verified',flush=True)
        return {k:a[k] for k in ('id','name','digest','size_in_bytes')}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        records=list(pool.map(fetch,[a for a in artifacts if a['name'] in required]))
    (root/'build-source.json').write_text(json.dumps({'sourceCommit':source,'runId':run_id,'runUrl':run['html_url'],'artifacts':records,'jobs':[{k:j[k] for k in ('name','conclusion','started_at','completed_at')} for j in jobs]},indent=2)+'\n')
if __name__=='__main__':main()
