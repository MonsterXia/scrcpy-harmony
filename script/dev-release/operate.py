"""Run the reviewed publisher on one disposable runner; all gates remain active."""
import importlib.util,json,os,shutil,subprocess,tempfile
from pathlib import Path

tools=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('publisher',tools/'publish-dev2.py')
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)

def validate_resume(run,artifact,operations):
    publisher.require(run['name']=='Dev.2 release operations' and run['head_sha']==operations and run['status']=='completed' and
        run['repository']['full_name']=='MonsterXia/scrcpy-harmony' and run['head_repository']['full_name']=='MonsterXia/scrcpy-harmony', 'Resume run identity differs')
    publisher.require(artifact['name']=='dev2-publication-audit' and not artifact['expired'] and
        artifact['workflow_run']['head_sha']==operations,'Resume artifact identity differs')

def main():
    publisher.require(os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted' and
        os.environ.get('GITHUB_REPOSITORY')=='MonsterXia/scrcpy-harmony' and os.environ.get('GITHUB_REF')=='refs/heads/codex/release-1.0.5-dev.2-operations', 'Only the authorized hosted operations branch may publish')
    repo=Path.cwd().resolve();config=json.loads((tools/'config.json').read_text())
    operations=os.environ['DEV2_OPERATIONS_SHA']
    publisher.require(subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==operations,'Local operations source differs')
    config.update(operations_sha=operations,acceptance_run=int(os.environ['DEV2_ACCEPTANCE_RUN']),repo_dir=str(repo),work_dir=str(repo/'release/dev2-1.0.5-audit'),notes_file=str(tools/'release-notes.md'))
    runtime=repo/'release/dev2-runtime-config.json';runtime.parent.mkdir(exist_ok=True);runtime.write_text(json.dumps(config))
    p=publisher.Publisher(runtime)
    resume=os.environ.get('DEV2_RESUME_RUN','')
    expected_prepared=None
    if resume:
        publisher.require(resume.isdecimal() and int(resume)>0 and resume!=os.environ['GITHUB_RUN_ID'],'Invalid resume run')
        run=p.api(f'actions/runs/{resume}')
        artifacts=p.pages(f'actions/runs/{resume}/artifacts','artifacts')
        publisher.require(len(artifacts)==1,'Resume artifact set differs')
        artifact=artifacts[0];validate_resume(run,artifact,operations)
        with tempfile.TemporaryDirectory(dir=p.root) as tmp:
            archive=Path(tmp)/'audit.zip'
            with archive.open('xb') as f:p.gh('api',f"repos/{config['repo']}/actions/artifacts/{artifact['id']}/zip",output=f)
            publisher.require(artifact.get('digest')=='sha256:'+publisher.digest(archive),'Resume archive digest differs')
            out=Path(tmp)/'extracted';publisher.safe_extract(archive,out)
            for name in ('release-state.json','prepared.json','artifact-manifest.json'):
                files=list(out.rglob(name));publisher.require(len(files)==1,'Missing or duplicate resume file: '+name)
                data=json.loads(files[0].read_text())
                if name!='artifact-manifest.json':publisher.require(data['identity']==p.identity,'Resume publication identity differs')
                if name=='prepared.json':expected_prepared=data
                else:shutil.copyfile(files[0],p.root/name)
    p.prepare()
    if expected_prepared is not None:
        publisher.require(json.loads(p.prepared_path.read_text())==expected_prepared,'Resumed asset manifest differs')
    p.draft()
    p.upload()
    p.verify_publish(True)

if __name__=='__main__':main()
