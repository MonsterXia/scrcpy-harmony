import importlib.util,stat,tempfile,unittest,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('fetch',Path(__file__).with_name('fetch-artifacts.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ArchiveTest(unittest.TestCase):
 def run_case(self,entries,good=False):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);z=root/'a.zip'
   with zipfile.ZipFile(z,'w') as out:
    for name,data,mode in entries:
     i=zipfile.ZipInfo(name);i.external_attr=mode<<16;out.writestr(i,data)
   if good:
    m.extract(z,root/'out',{'a.exe'});self.assertEqual((root/'out'/m.VERSION/'a.exe').read_bytes(),b'payload')
   else:
    with self.assertRaises(RuntimeError):m.extract(z,root/'out',{'a.exe'})
    self.assertFalse((root/'out').exists())
 def test_valid(self):self.run_case([(m.VERSION+'/a.exe',b'payload',stat.S_IFREG|0o644)],True)
 def test_traversal(self):self.run_case([('../a.exe',b'x',0)])
 def test_backslash(self):self.run_case([(m.VERSION+'\\a.exe',b'x',0)])
 def test_symlink(self):self.run_case([(m.VERSION+'/a.exe',b'target',stat.S_IFLNK|0o777)])
 def test_empty(self):self.run_case([(m.VERSION+'/a.exe',b'',0)])
 def test_duplicate(self):self.run_case([(m.VERSION+'/a.exe',b'x',0),(m.VERSION+'/A.exe',b'y',0)])
 def test_extra(self):self.run_case([(m.VERSION+'/a.exe',b'x',0),(m.VERSION+'/secret.txt',b'y',0)])
 def test_missing(self):self.run_case([])
class PublishedIdentityTest(unittest.TestCase):
 def setUp(self):
  self.previous={'passed':True,'draft':True,'mode':'draft','releaseId':42,'sourceCommit':'source','tag':'v'+m.VERSION,'downloadedAndVerified':[{'id':7,'name':'app','size':5,'sha256':'hash'}]}
  self.assets=[{'id':7,'name':'app','size':5,'digest':'sha256:hash'}]
 def test_same_identity(self):m.verify_draft_identity(self.previous,self.assets,42,'source')
 def test_replaced_asset_same_bytes(self):
  self.assets[0]['id']=8
  with self.assertRaises(RuntimeError):m.verify_draft_identity(self.previous,self.assets,42,'source')
 def test_other_release(self):
  with self.assertRaises(RuntimeError):m.verify_draft_identity(self.previous,self.assets,43,'source')
 def test_unverified_draft(self):
  self.previous['passed']=False
  with self.assertRaises(RuntimeError):m.verify_draft_identity(self.previous,self.assets,42,'source')
if __name__=='__main__':unittest.main()
