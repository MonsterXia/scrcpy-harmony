"""Genuine installed applications on disposable native runners; no device mocks."""
import hashlib,json,os,shutil,subprocess,sys
from pathlib import Path

tools=Path(__file__).resolve().parent
c=json.loads((tools/'config.json').read_text())
repo=c['repo']; source=c['source_sha']; build=c['build_run']
baseline_source='62a7e28727a8feb20848ba340af492516a444c5a'
baseline_build=43989343625
platform=os.environ['RELEASE_PLATFORM']; arch=os.environ['EXPECTED_ARCH']; mode=os.environ['RELEASE_MODE']
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted'
assert mode in ('preflight','postrelease') and (platform,arch) in [('win','x64'),('mac','arm64'),('mac','x64')]
ext='exe' if platform=='win' else 'dmg'
artifact='windows-latest' if platform=='win' else 'macos-15' if arch=='arm64' else 'macos-15-intel'
output=Path('release/dev2-acceptance').resolve();output.mkdir(parents=True,exist_ok=True)
def run(args,**kw):return subprocess.run(args,check=True,**kw)
def api(p):return json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/{p}']))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def published(version,product):
    rel=api('releases/tags/v'+version);assert not rel['draft']
    name=f'{product.replace(" ","-")}-{version}-{platform}-{arch}.{ext}'
    asset=next(a for a in rel['assets'] if a['name']==name)
    expected=asset['digest'].removeprefix('sha256:');assert len(expected)==64
    directory=output/('published-'+version);directory.mkdir(exist_ok=True)
    run(['gh','release','download','v'+version,'--repo',repo,'--pattern',name,'--dir',str(directory)])
    file=directory/name;assert sha(file)==expected
    return file,expected,'published '+rel['html_url']
def built(run_id,commit,version):
    info=api(f'actions/runs/{run_id}')
    assert info['head_sha']==commit and info['conclusion']=='success' and info['name']=='Build'
    directory=output/('build-'+str(run_id));directory.mkdir()
    run(['gh','run','download',str(run_id),'--repo',repo,'--name',artifact,'--dir',str(directory)])
    files=list(directory.rglob(f'Scrcpy Plus-{version}-{platform}-{arch}.{ext}'));assert len(files)==1
    file=files[0]
    report_name=f'verification-{platform}-{arch}.'+('json' if platform=='win' else 'txt')
    reports=list(directory.rglob(report_name));assert len(reports)==1
    text=reports[0].read_text(encoding='utf-8-sig')
    if platform=='win':
        report=json.loads(text);assert report['sourceCommit']==commit and report['installationAndStartup']=='passed'
        expected=report['sha256']
    else:
        assert f'sourceCommit={commit}' in text and 'codesignVerifyExit=0' in text
        expected=next(line.split()[0] for line in text.splitlines() if line.endswith(file.name))
    assert sha(file)==expected
    return file,expected,f'Build {run_id} source {commit}'

candidate=built(build,source,c['version']) if mode=='preflight' else published(c['version'],'Scrcpy Plus')
candidate_assets=[dict(name=f"Scrcpy-Plus-{c['version']}-{platform}-{arch}.{ext}",size=candidate[0].stat().st_size,sha256=candidate[1])]
if platform=='mac' and arch=='arm64':
    cli_name=f"scrcpy-plus-cli-{c['version']}.tgz"
    if mode=='preflight':
        files=list((output/('build-'+str(build))).rglob(cli_name));assert len(files)==1;client=files[0]
    else:
        directory=output/('published-'+c['version'])
        run(['gh','release','download',c['tag'],'--repo',repo,'--pattern',cli_name,'--dir',str(directory)])
        client=directory/cli_name
        rel=api('releases/tags/'+c['tag']);asset=next(a for a in rel['assets'] if a['name']==cli_name)
        assert asset['digest']=='sha256:'+sha(client)
    run(['npm','exec','--','node',str(tools/'check-client.mjs'),str(client),c['version']])
    candidate_assets.append(dict(name=cli_name,size=client.stat().st_size,sha256=sha(client)))
baseline=built(baseline_build,baseline_source,'1.0.5-dev.1')
legacy={v:published(v,'Scrcpy Harmony') for v in ['1.0.4','1.0.5-dev.1']}
env=os.environ.copy();env.pop('SCRCPY_PLUS_PROFILE',None);env.pop('RELEASE_PROFILE',None)
env.update(RELEASE_DEFAULT_PROFILE='true',RELEASE_EXPECT_STABLE='1.0.4',RELEASE_EXPECT_BETA='1.0.5-dev.1' if mode=='preflight' else c['version'],RELEASE_BETA_EXPECT='true')
summaries=[];preservation=[];step=0
install_base=Path(os.environ['RUNNER_TEMP'])/'dev2-acceptance-installed'
plus_profile=None

def check(item,version,product,expect,label,restart=False):
    global step,plus_profile
    step+=1;dest=output/f'{step:02}-{label}';dest.mkdir()
    env.pop('RELEASE_PRESERVE_PROFILE',None);env.pop('RELEASE_EXPECT_MAIN',None);env.pop('RELEASE_SEED_MAIN',None)
    if label=='plus-baseline':env['RELEASE_SEED_MAIN']='true'
    if label=='plus-upgrade':env.update(RELEASE_PRESERVE_PROFILE=str(plus_profile),RELEASE_EXPECT_MAIN='normalize-disconnected')
    env.update(RELEASE_PRODUCT=product,RELEASE_PROFILE_EXPECT=expect,RELEASE_SOURCE_LABEL=item[2],RELEASE_INSTALL_ROOT=str(install_base/product))
    if restart:
        executable=summaries[-1]['executable']
        run(['node',str(tools/'check-update.mjs'),executable,version,str(dest),env['RELEASE_EXPECT_STABLE'],env['RELEASE_EXPECT_BETA']],env=env)
    else:
        run(['node',str(tools/'install-check.mjs'),str(item[0]),version,str(dest),item[1]],env=env)
    report=json.loads((dest/'report.json').read_text());assert report['passed'] and not report['local']
    report.update(label=label,source=item[2]);summaries.append(report)
    if product=='Scrcpy Plus':plus_profile=Path(report['profile'])
    return report

def snapshot(report):
    profile=Path(report['profile']);exe=Path(report['executable'])
    assert exe.is_file()
    return {'exe':(exe,sha(exe)),'data':{p:sha(p) for p in (profile/'data').glob('*.json')}}
def unchanged(s):
    exe,digest=s['exe'];assert exe.is_file() and sha(exe)==digest,'Legacy executable changed'
    assert s['data'] and all(p.is_file() and sha(p)==h for p,h in s['data'].items()),'Legacy profile changed'
    return {'oldExecutableUnchanged':True,'oldProfileFilesUnchanged':len(s['data'])}
def archive_plus_profile():
    if plus_profile is None:return
    assert plus_profile.name=='Scrcpy Plus' and plus_profile.is_dir()
    assert plus_profile.resolve().is_relative_to(Path.home().resolve()),'Unexpected profile location'
    # Move only the profile this test created and observed; preserve it as evidence.
    shutil.move(str(plus_profile),str(output/f'private-profile-{step}'))

archive_plus_profile()
check(baseline,'1.0.5-dev.1','Scrcpy Plus','fresh','plus-baseline')
check(candidate,c['version'],'Scrcpy Plus','preserved','plus-upgrade')
check(candidate,c['version'],'Scrcpy Plus','preserved','plus-upgrade-restart',True)
for index,version in enumerate(['1.0.4','1.0.5-dev.1']):
    archive_plus_profile()
    old=check(legacy[version],version,'Scrcpy Harmony','fresh' if index==0 else 'preserved','harmony-'+version)
    before=snapshot(old)
    check(candidate,c['version'],'Scrcpy Plus','fresh','plus-from-harmony-'+version)
    check(candidate,c['version'],'Scrcpy Plus','preserved','plus-restart-'+version,True)
    preservation.append({'path':'Harmony '+version+' → Plus',**unchanged(before)})
assert len(summaries)==9 and all(s['passed'] for s in summaries)
main_preservation=json.loads((output/'02-plus-upgrade'/'profile-preservation.json').read_text())
assert main_preservation['mainAndSettingsBytesPreserved'] and main_preservation['overviewChoiceSerialized'] and summaries[1]['disconnectedOverviewNormalized']
main_preservation['disconnectedOverviewNormalized']=True
summary=dict(plusMainPreservation=main_preservation,mode=mode,source=source,build=build,baselineSource=baseline_source,baselineBuild=baseline_build,platform=platform,arch=arch,passed=True,candidateAssets=candidate_assets,scenarios=sum(len(s['scenarios']) for s in summaries),starts=len(summaries),legacyPreservation=preservation,versions=[dict(label=s['label'],version=s['version'],scenarios=len(s['scenarios']),settingsPreserved=s.get('settingsPreserved',False),freshProfile=s.get('freshProfile',False),source=s['source']) for s in summaries])
(output/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
