"""Create an English-only deployment artifact; keep Chinese source for .cn."""
from pathlib import Path
import shutil
import sys

EXCLUDED = {'cn', 'design-study', 'index.zh.html', '404.zh.html', 'founding-oem.js'}

def prepare(source, target):
    if target.exists():
        raise RuntimeError('Use a new artifact directory')
    def ignore(directory, names):
        rel = Path(directory).relative_to(source)
        if rel == Path('.'):
            return [name for name in names if name in EXCLUDED or name in {'node_modules', '.wrangler'}]
        if rel.as_posix() in {'oem', 'why', 'robots'}:
            return ['zh'] if 'zh' in names else []
        return []
    shutil.copytree(source, target, ignore=ignore)
    assert not (target / 'cn').exists()
    assert (target / 'en/index.html').exists()
    assert (target / '_worker.js').exists()
    print('Prepared English-only international artifact; Chinese sources retained')

if __name__ == '__main__':
    prepare(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
