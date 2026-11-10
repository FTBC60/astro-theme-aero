"""Independently verify browser downloads with Python's standard ZIP reader."""
import json
from pathlib import Path
from zipfile import ZipFile
from tempfile import mkdtemp

project = Path(__file__).resolve().parents[3]
fixture = json.loads((project / '.astro/tool-packages-phase-b/manifest.json').read_text(encoding='utf-8-sig'))
run = Path(fixture['run']).resolve()
assert run.is_relative_to((project / '.astro/tool-packages-phase-b').resolve())
report = json.loads((Path(fixture['output']) / 'browser-report.json').read_text(encoding='utf-8-sig'))
source = Path(fixture['notes']) / 'day/timestamp'
manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8-sig'))
assert len(report['downloads']) == 8
extracted = Path(mkdtemp(prefix='extracted-tool-', dir=run)).resolve()
assert extracted.is_relative_to(run)
verified = []
for item in report['downloads']:
    file = Path(item['file']).resolve()
    assert file.is_relative_to(run)
    if item['name'].endswith('.zip'):
        with ZipFile(file) as archive:
            assert archive.testzip() is None
            assert sorted(archive.namelist()) == sorted(manifest['files'] + ['manifest.json'])
            assert all((extracted / member).resolve().is_relative_to(extracted) for member in archive.namelist())
            for member in manifest['files']:
                assert archive.read(member) == (source / member).read_bytes(), member
            assert json.loads(archive.read('manifest.json')) == manifest
            assert archive.read('manifest.json') == (source / 'manifest.json').read_bytes()
            if item['environment'] == 'preview' and item['placement'] == 'iframe':
                archive.extractall(extracted)
    else:
        assert file.read_bytes() == (Path(fixture['notes']) / 'day/legacy.html').read_bytes()
        (extracted / 'legacy.html').write_bytes(file.read_bytes())
    verified.append({key: item[key] for key in ['environment', 'placement', 'name']})
(run / 'download-verification.json').write_text(json.dumps({'verified': verified, 'extracted': str(extracted)}, indent=2) + '\n', encoding='utf-8')
print(f'PASS: {len(verified)} actual downloads verified with zipfile CRC and original-byte comparisons.')
print(f'Extracted tool: {extracted}')
