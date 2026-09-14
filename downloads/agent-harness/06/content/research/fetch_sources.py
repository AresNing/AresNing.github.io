"""Fetch exact official source archives, verify hashes, never overwrite an existing tree."""
import hashlib
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
for item in json.loads((ROOT/'evidence/versions.json').read_text()):
    name = item['project']
    target = ROOT/'research/repos'/name
    if target.exists():
        print(f'{name}: existing tree preserved')
        continue
    repository = item['repository'].removeprefix('https://github.com/')
    url = f'https://codeload.github.com/{repository}/tar.gz/{item["commit"]}'
    archives = ROOT/'research/archives'
    archives.mkdir(parents=True, exist_ok=True)
    archive = archives/f'{name}.tar.gz'
    if not archive.exists():
        with urllib.request.urlopen(url, timeout=90) as response:
            archive.write_bytes(response.read())
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual != item['archive_sha256']:
        raise ValueError(f'{name}: archive hash mismatch; no extraction performed')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as folder:
        with tarfile.open(archive) as bundle:
            bundle.extractall(folder, filter='data')
        roots = list(Path(folder).iterdir())
        if len(roots) != 1:
            raise ValueError(f'{name}: unexpected archive layout')
        shutil.move(str(roots[0]), target)
    print(f'{name}: verified {item["commit"]}')
