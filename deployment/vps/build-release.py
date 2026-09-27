#!/usr/bin/env python3
"""Build ONLY manifest-approved static files; never package the whole workspace."""
import argparse, hashlib, json, pathlib, re, shutil, tarfile
p=argparse.ArgumentParser()
p.add_argument('--source', type=pathlib.Path, required=True)
p.add_argument('--manifest', type=pathlib.Path, required=True)
p.add_argument('--output', type=pathlib.Path, required=True)
a=p.parse_args()
m=json.loads(a.manifest.read_text(encoding='utf-8-sig'))
if not re.fullmatch(r'[a-f0-9]{40}',m['commit']): raise SystemExit('Invalid commit')
name=m['version'].split('-')[-1]+'-'+m['commit'][:12]+'-vps1'
if not re.fullmatch(r'[A-Za-z0-9._-]+',name): raise SystemExit('Invalid release name')
dest=a.output.resolve()/name
if dest.exists(): raise SystemExit('Release already exists; verify instead of overwriting')
for file,expected in m['files'].items():
    if not re.fullmatch(r'[a-zA-Z0-9._/-]+',file) or '..' in pathlib.PurePosixPath(file).parts: raise SystemExit('Unsafe manifest path')
    source=a.source/file
    if source.is_symlink() or not source.is_file(): raise SystemExit('Source missing/linked: '+file)
    if hashlib.sha256(source.read_bytes()).hexdigest()!=expected: raise SystemExit('Source changed: '+file)
config=(a.source/'firebase-config.js').read_text(encoding='utf-8')
if 'projectId: "kubah-admin-app"' not in config: raise SystemExit('Wrong Firebase project')
public=(a.source/'toko.html').read_text(encoding='utf-8')
if re.search(r'Admin toko',public,re.I): raise SystemExit('Public admin link exists')
dest.mkdir(parents=True)
checks=[]
for file,expected in m['files'].items():
    target=dest/'webroot'/file; target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(a.source/file,target)
    checks.append(expected+'  webroot/'+file)
(dest/'SHA256SUMS').write_text('\n'.join(checks)+'\n',encoding='utf-8')
(dest/'release.json').write_text(json.dumps({'release':name,'sourceCommit':m['commit'],'branch':m['branch'],'repository':m['repository'],'applicationVersion':m['version'],'files':len(checks),'firebaseProject':'kubah-admin-app','supabaseProject':'lejkvtobwlknztolzjqk','dataIncluded':False},indent=2)+'\n',encoding='utf-8')
archive=a.output/(name+'.tar.gz')
with tarfile.open(archive,'w:gz') as tar: tar.add(dest,arcname=name)
print(json.dumps({'release':name,'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':len(checks)},indent=2))
