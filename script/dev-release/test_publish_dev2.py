"""Offline safety checks; no GitHub, installer, or device operations."""
import base64
import contextlib
import hashlib
import io
import copy
import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import Mock
import zipfile

SCRIPT = Path(__file__).with_name('publish-dev2.py')
spec = importlib.util.spec_from_file_location('publisher', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublishSafetyTests(unittest.TestCase):
    def test_prepare_requires_both_macos_signature_checks(self):
        cases = [(None, None)] + [(platform, key) for platform in ('macos-15', 'macos-15-intel')
            for key in ('codesignDetailsExit', 'codesignVerifyExit')] + [('windows-latest',key) for key in ('yaml-url','yaml-size','yaml-sha512')]
        for bad_platform, bad_key in cases:
            with self.subTest(platform=bad_platform, key=bad_key), tempfile.TemporaryDirectory() as tmp:
                p = object.__new__(module.Publisher)
                p.root = Path(tmp)
                p.assets_dir = p.root / 'verified-assets'
                p.prepared_path = p.root / 'prepared.json'
                p.c = {'version': '1.0.5-dev.2', 'source_sha': 'a'*40, 'repo': 'MonsterXia/scrcpy-harmony',
                    'ci_run': 1, 'build_run': 2, 'preparation_pr': 75}
                p.identity = p.c.copy()
                p.accepted_assets = []
                p.verify_source = Mock()
                p.yaml = lambda path: json.loads(path.read_text())
                artifacts = []
                for artifact_id, (platform, (suffix, metadata_name, report_name)) in enumerate(module.PLATFORMS.items()):
                    installer = f"Scrcpy Plus-{p.c['version']}-{suffix}"
                    safe = installer.replace('Scrcpy Plus', 'Scrcpy-Plus')
                    content = f'fixture-{platform}'.encode()
                    sha256 = hashlib.sha256(content).hexdigest()
                    sha512 = base64.b64encode(hashlib.sha512(content).digest()).decode()
                    p.accepted_assets.append({'name':safe,'size':len(content),'sha256':sha256})
                    metadata = {'version': p.c['version'], 'files': [{'url': safe, 'size': len(content), 'sha512': sha512}],
                        'path': safe, 'sha512': sha512}
                    if platform == bad_platform and bad_key == 'yaml-url': metadata['files'][0]['url']='wrong.exe'
                    if platform == bad_platform and bad_key == 'yaml-size': metadata['files'][0]['size']+=1
                    if platform == bad_platform and bad_key == 'yaml-sha512': metadata['sha512']='wrong'
                    run_url = 'https://github.com/MonsterXia/scrcpy-harmony/actions/runs/2'
                    if report_name.endswith('.json'):
                        report = json.dumps({'sourceCommit': 'a'*40, 'runUrl': run_url, 'installationAndStartup': 'passed',
                            'installer': installer, 'sha256': sha256, 'authenticodeStatus': 'NotSigned', 'signer': None})
                    else:
                        lines = ['sourceCommit='+'a'*40, 'runUrl='+run_url, 'installationAndStartup=passed', sha256+'  '+installer]
                        for key in ('codesignDetailsExit','codesignVerifyExit','gatekeeperExit','staplerExit'):
                            lines.append(f'{key}={int((platform,key)==(bad_platform,bad_key))}')
                        report = '\n'.join(lines)
                    archive = p.root / f'artifact-{artifact_id}.zip'
                    with zipfile.ZipFile(archive, 'w') as zipped:
                        for name, value in [(installer, content),(installer+'.blockmap',b'blockmap'),
                                (metadata_name,json.dumps(metadata)),(report_name,report)]:
                            zipped.writestr(name, value)
                        if platform == 'macos-15':
                            import tarfile
                            data=io.BytesIO()
                            with tarfile.open(fileobj=data, mode='w:gz') as tgz:
                                for filename,body in [('package.json',json.dumps({'name':'scrcpy-plus-cli','version':p.c['version'],'bin':{'scrcpy-plus':'index.cjs','scrcpy-plus-mcp':'mcp.cjs'}}).encode()),('index.cjs',b'cli'),('mcp.cjs',b'mcp'),('LICENSE',b'license'),('THIRD_PARTY_LICENSES.txt',b'zod')]:
                                    item=tarfile.TarInfo('package/'+filename);item.size=len(body);tgz.addfile(item,io.BytesIO(body))
                            zipped.writestr('scrcpy-plus-cli-'+p.c['version']+'.tgz',data.getvalue())
                            p.accepted_assets.append({'name':'scrcpy-plus-cli-'+p.c['version']+'.tgz','size':len(data.getvalue()),'sha256':hashlib.sha256(data.getvalue()).hexdigest()})
                    artifacts.append({'id':artifact_id,'name':platform,'expired':False,
                        'workflow_run':{'head_sha':'a'*40},'digest':'sha256:'+module.digest(archive),
                        'size_in_bytes':archive.stat().st_size})
                p.pages = Mock(return_value=artifacts)
                p.gh = Mock(side_effect=AssertionError('Unexpected external command'))
                with contextlib.redirect_stdout(io.StringIO()):
                    if bad_platform is None:
                        p.prepare()
                        prepared = json.loads(p.prepared_path.read_text())
                        self.assertEqual(len(prepared['assets']),15)
                        self.assertEqual({item['name'] for item in prepared['assets']},p.expected_names())
                    else:
                        with self.assertRaisesRegex(module.VerificationError,'YAML' if str(bad_key).startswith('yaml-') else 'macOS signature must pass strict verification before publication'):
                            p.prepare()
                        self.assertFalse(p.prepared_path.exists())
                p.gh.assert_not_called()

    def test_only_known_optional_sidecars_are_excluded(self):
        required = {'installer.dmg', 'installer.dmg.blockmap', 'latest.yml', 'verification.txt'}
        required_paths = [Path('version') / name for name in required]
        optional_paths = {'version/builder-debug.yml', 'version/mac/App.app/Contents/Resources/app-update.yml'}
        for optional in ([], [Path('version/builder-debug.yml')],
                         [Path('version/mac/App.app/Contents/Resources/app-update.yml')],
                         [Path('version/builder-debug.yml'), Path('version/mac/App.app/Contents/Resources/app-update.yml')]):
            with self.subTest(optional=optional):
                selected, ignored = module.classify_artifact_files(required_paths + optional, required, Path('.'), optional_paths)
                self.assertEqual(set(selected), required)
                self.assertEqual(set(ignored), set(optional))
        for extra in ([Path('unexpected.yml')], [Path('elsewhere/installer.dmg')],
                      [Path('wrong/builder-debug.yml')], [Path('wrong/app-update.yml')],
                      [Path('a/app-update.yml'), Path('b/app-update.yml')]):
            with self.subTest(extra=extra), self.assertRaises(module.VerificationError):
                module.classify_artifact_files(required_paths + extra, required, Path('.'), optional_paths)
        with self.assertRaises(module.VerificationError):
            module.classify_artifact_files(required_paths[1:] + [Path('builder-debug.yml')], required, Path('.'), optional_paths)

    def test_zip_accepts_regular_files(self):
        with tempfile.TemporaryDirectory() as root:
            archive, out = Path(root) / 'ok.zip', Path(root) / 'out'
            with zipfile.ZipFile(archive, 'w') as zipped:
                zipped.writestr('v1/installer.exe', b'fixture')
            module.safe_extract(archive, out)
            self.assertEqual((out / 'v1/installer.exe').read_bytes(), b'fixture')

    def test_zip_refuses_unsafe_paths_before_writing(self):
        for name in ('../escape', '/absolute', 'a/../escape', 'C:/escape', 'a\\escape', 'a//b'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as root:
                archive, out = Path(root) / 'bad.zip', Path(root) / 'out'
                with zipfile.ZipFile(archive, 'w') as zipped:
                    zipped.writestr('safe-first', b'fine')
                    zipped.writestr(name, b'bad')
                with self.assertRaises(module.VerificationError):
                    module.safe_extract(archive, out)
                self.assertFalse(out.exists())

    def test_zip_refuses_symlink_and_special_file(self):
        for mode in (stat.S_IFLNK | 0o777, stat.S_IFIFO | 0o600):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as root:
                archive, out = Path(root) / 'bad.zip', Path(root) / 'out'
                with zipfile.ZipFile(archive, 'w') as zipped:
                    entry = zipfile.ZipInfo('link')
                    entry.create_system = 3
                    entry.external_attr = mode << 16
                    zipped.writestr(entry, b'../escape')
                with self.assertRaises(module.VerificationError):
                    module.safe_extract(archive, out)
                self.assertFalse(out.exists())

    def test_zip_refuses_collision(self):
        for names in (('A', 'a'), ('a', 'a/file')):
            with self.subTest(names=names), tempfile.TemporaryDirectory() as root:
                archive, out = Path(root) / 'bad.zip', Path(root) / 'out'
                with zipfile.ZipFile(archive, 'w') as zipped:
                    for name in names:
                        zipped.writestr(name, b'fixture')
                with self.assertRaises(module.VerificationError):
                    module.safe_extract(archive, out)
                self.assertFalse(out.exists())

    def test_local_evidence_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'evidence'
            module.write_identical(path, b'original')
            module.write_identical(path, b'original')
            with self.assertRaises(module.VerificationError):
                module.write_identical(path, b'changed')
            self.assertEqual(path.read_bytes(), b'original')

    def test_remote_mismatch_or_extra_asset_stops(self):
        publisher = object.__new__(module.Publisher)
        expected = {'file': {'name': 'file', 'size': 7, 'sha256': 'a' * 64}}
        good = {'name': 'file', 'state': 'uploaded', 'size': 7, 'digest': 'sha256:' + 'a' * 64}
        publisher.validate_assets({'assets': [good]}, expected, True)
        for mutation in ({'digest': 'sha256:' + 'b' * 64}, {'state': 'starter'}, {'name': 'unknown'}, {'size': 8}):
            with self.subTest(mutation=mutation), self.assertRaises(module.VerificationError):
                publisher.validate_assets({'assets': [good | mutation]}, expected, False)
        with self.assertRaises(module.VerificationError):
            publisher.validate_assets({'assets': [good, good]}, expected, True)

    def fake_publisher(self, root):
        publisher = object.__new__(module.Publisher)
        publisher.root = Path(root)
        publisher.identity = {'source_sha': 'a' * 40}
        publisher.c = {'repo': 'MonsterXia/scrcpy-harmony', 'stable_tag': 'v1.0.3'}
        files = {}
        assets = []
        for i in range(15):
            path = Path(root) / f'asset-{i}'
            path.write_bytes(f'fixture-{i}'.encode())
            files[path.name] = {'name': path.name, 'size': path.stat().st_size, 'sha256': module.digest(path)}
            assets.append({'id': i + 100, 'name': path.name, 'state': 'uploaded', 'size': path.stat().st_size,
                           'digest': 'sha256:' + module.digest(path), 'updated_at': 'fixed'})
        release = {'id': 123, 'draft': True, 'prerelease': True, 'assets': assets,
                   'published_at': None, 'html_url': 'https://example.invalid/release', 'updated_at': 'fixed'}
        publisher.prepared = Mock(return_value=files)
        publisher.verify_source = Mock()
        publisher.from_state = Mock(side_effect=lambda: copy.deepcopy(release))
        publisher.check_latest = Mock()

        def gh(*args, output=None, **kwargs):
            asset_id = int(args[1].rsplit('/', 1)[-1])
            name = next(a['name'] for a in assets if a['id'] == asset_id)
            output.write((Path(root) / name).read_bytes())

        def api(path, method='GET', data=None):
            self.assertEqual((path, method, data), ('releases/123', 'PATCH',
                {'draft': False, 'prerelease': True, 'make_latest': 'false'}))
            release['draft'] = False
            release['published_at'] = 'now'
            return release

        publisher.gh = Mock(side_effect=gh)
        publisher.api = Mock(side_effect=api)
        return publisher, release

    def test_verify_without_flag_is_read_only_and_downloads_all_by_id(self):
        with tempfile.TemporaryDirectory() as root:
            publisher, _ = self.fake_publisher(root)
            publisher.verify_publish(False)
            publisher.api.assert_not_called()
            self.assertEqual(publisher.gh.call_count, 15)
            publisher.verify_source.assert_called_once_with(require_merged=True)

    def test_publish_only_patches_fixed_id_after_downloads(self):
        with tempfile.TemporaryDirectory() as root:
            publisher, _ = self.fake_publisher(root)
            publisher.verify_publish(True)
            self.assertEqual(publisher.gh.call_count, 15)
            publisher.api.assert_called_once()
            self.assertTrue((Path(root) / 'publication-audit.json').is_file())

    def test_concurrent_change_or_download_corruption_prevents_publish(self):
        for corruption in ('concurrent', 'bytes'):
            with self.subTest(corruption=corruption), tempfile.TemporaryDirectory() as root:
                publisher, release = self.fake_publisher(root)
                good_gh = publisher.gh.side_effect

                def changed_gh(*args, output=None, **kwargs):
                    if corruption == 'bytes':
                        output.write(b'corrupted')
                    else:
                        good_gh(*args, output=output, **kwargs)
                        release['updated_at'] = 'changed'

                publisher.gh.side_effect = changed_gh
                with self.assertRaises(module.VerificationError):
                    publisher.verify_publish(True)
                publisher.api.assert_not_called()



class Dev0IdentityTests(unittest.TestCase):
    def test_only_current_prerelease_and_stable_identity_is_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp); (repo/'release').mkdir()
            config=dict(repo='MonsterXia/scrcpy-harmony',version='1.0.5-dev.2',tag='v1.0.5-dev.2',source_sha='a'*40,baseline_sha='b'*40,ci_run=1,build_run=2,preparation_pr=81,operations_sha='c'*40,acceptance_run=3,stable_tag='v1.0.4',repo_dir=str(repo),work_dir=str(repo/'release/audit'),notes_file=str(repo/'notes.md'),release_name='Scrcpy Plus 1.0.5-dev.2')
            file=repo/'config.json';file.write_text(json.dumps(config))
            self.assertEqual(module.Publisher(file).c['version'],'1.0.5-dev.2')
            for field,value in [('version','1.0.5-dev.3'),('tag','v1.0.5'),('stable_tag','v1.0.3')]:
                invalid=dict(config);invalid[field]=value;file.write_text(json.dumps(invalid))
                with self.assertRaises(module.VerificationError):module.Publisher(file)

class AcceptanceGateTests(unittest.TestCase):
    def test_wrong_source_mode_or_incomplete_matrix_is_rejected(self):
        c={'source_sha':'a'*40,'build_run':123,'version':'1.0.5-dev.2'}
        summary={'mode':'preflight','source':'a'*40,'build':123,'platform':'mac','arch':'arm64','passed':True,'starts':9,'scenarios':54,'legacyPreservation':[{'oldExecutableUnchanged':True,'oldProfileFilesUnchanged':2}]*2,'versions':[{'scenarios':6}]*9,'plusMainPreservation':{'mainAndSettingsBytesPreserved':True,'overviewChoiceSerialized':True,'disconnectedOverviewNormalized':True},'candidateAssets':[{'name':'Scrcpy-Plus-1.0.5-dev.2-mac-arm64.dmg','size':3,'sha256':'a'*64},{'name':'scrcpy-plus-cli-1.0.5-dev.2.tgz','size':4,'sha256':'b'*64}]}
        module.validate_acceptance_summary(summary,c,'mac','arm64')
        for change in [{'source':'b'*40},{'build':124},{'mode':'postrelease'},{'passed':False},{'starts':8},{'scenarios':0},{'legacyPreservation':[]}]:
            with self.subTest(change=change), self.assertRaises(module.VerificationError):
                module.validate_acceptance_summary(summary|change,c,'mac','arm64')

    def test_same_build_with_replaced_bytes_is_rejected(self):
        accepted=[{'name':'installer.dmg','size':3,'sha256':'a'*64},{'name':'client.tgz','size':4,'sha256':'b'*64}]
        module.validate_candidate_assets(accepted,accepted)
        for field,value in [('sha256','c'*64),('size',8),('name','other.dmg')]:
            changed=[accepted[0]|{field:value},accepted[1]]
            with self.subTest(field=field),self.assertRaises(module.VerificationError):module.validate_candidate_assets(accepted,changed)
        with self.assertRaises(module.VerificationError):module.validate_candidate_assets(accepted,accepted[:1])

    def test_wrong_source_run_cannot_reach_release_mutation(self):
        for change in [{'head_sha':'b'*40},{'conclusion':'failure'},{'name':'Other'}]:
            p=object.__new__(module.Publisher);p.c={'ci_run':1,'build_run':2,'source_sha':'a'*40}
            p.api=Mock(return_value={'head_sha':'a'*40,'name':'CI','status':'completed','conclusion':'success'}|change)
            with self.assertRaises(module.VerificationError):p.verify_source(True)
            p.api.assert_called_once_with('actions/runs/1')

    def test_existing_tag_mismatch_is_never_moved(self):
        p=object.__new__(module.Publisher);p.c={'tag':'v1.0.5-dev.2','source_sha':'a'*40}
        for obj in [{'type':'commit','sha':'b'*40},{'type':'tag','sha':'a'*40}]:
            p.api=Mock(return_value={'object':obj})
            with self.assertRaises(module.VerificationError):p.check_tag()
            p.api.assert_called_once_with('git/ref/tags/v1.0.5-dev.2',allow404=False)

    def test_cli_archive_rejects_missing_symlink_or_wrong_version(self):
        import tarfile
        for variant in ['valid','missing','symlink','version']:
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as tmp:
                file=Path(tmp)/'client.tgz'
                with tarfile.open(file,'w:gz') as tar:
                    for name,body in [('package.json',json.dumps({'name':'scrcpy-plus-cli','version':'bad' if variant=='version' else '1.0.5-dev.2','bin':{'scrcpy-plus':'index.cjs','scrcpy-plus-mcp':'mcp.cjs'}}).encode()),('index.cjs',b'cli'),('mcp.cjs',b'mcp'),('LICENSE',b'license'),('THIRD_PARTY_LICENSES.txt',b'zod')]:
                        if name=='mcp.cjs' and variant=='missing':continue
                        item=tarfile.TarInfo('package/'+name);item.size=len(body)
                        if name=='index.cjs' and variant=='symlink':item.type=tarfile.SYMTYPE;item.linkname='/etc/passwd'
                        tar.addfile(item,io.BytesIO(body))
                if variant=='valid':module.verify_cli_archive(file,'1.0.5-dev.2')
                else:
                    with self.assertRaises(module.VerificationError):module.verify_cli_archive(file,'1.0.5-dev.2')

if __name__ == '__main__':
    unittest.main()
