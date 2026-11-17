import copy,importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('operate',Path(__file__).with_name('operate.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class HostedOperationsTests(unittest.TestCase):
    def test_resume_rejects_wrong_source_repository_or_incomplete_run(self):
        sha='a'*40
        run=dict(name='Dev.2 release operations',head_sha=sha,status='completed',repository={'full_name':'MonsterXia/scrcpy-harmony'},head_repository={'full_name':'MonsterXia/scrcpy-harmony'})
        artifact=dict(name='dev2-publication-audit',expired=False,workflow_run={'head_sha':sha})
        m.validate_resume(run,artifact,sha)
        for key,value in [('name','Build'),('head_sha','b'*40),('status','in_progress'),('repository',{'full_name':'foreign/repo'}),('head_repository',{'full_name':'foreign/repo'})]:
            with self.subTest(key=key),self.assertRaises(m.publisher.VerificationError):m.validate_resume(run|{key:value},artifact,sha)
        for key,value in [('name','another-audit'),('expired',True),('workflow_run',{'head_sha':'b'*40})]:
            with self.subTest(key=key),self.assertRaises(m.publisher.VerificationError):m.validate_resume(run,artifact|{key:value},sha)
