"""Add the shared PWA hooks to official pages without rebuilding their content.

Safe to run against a copy of the current domestic release. Dynamic course,
account and Cloud pages are deliberately outside this script's scope.
"""
from pathlib import Path
import os
import re
import stat
import sys


def prepare(root, languages=('cn', 'en')):
    changed = []
    for language in languages:
        for page in sorted((root / language).rglob('index.html')):
            source = page.read_text()
            if '<head' not in source or '</head>' not in source:
                continue
            if re.search(r'<link\b[^>]*\brel=["\']manifest["\']', source):
                continue
            locale = 'en' if language == 'en' else 'zh'
            hooks = (
                f'<link rel="manifest" href="/pwa/manifest-{locale}.webmanifest">'
                '<link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png">'
                '<meta name="apple-mobile-web-app-capable" content="yes">'
                '<meta name="apple-mobile-web-app-title" content="OriginMind">'
                '<meta name="mobile-web-app-capable" content="yes">'
                '<link rel="stylesheet" href="/pwa/install.css?v=20261021-1">'
                '<script src="/pwa/install.js?v=20261021-1" defer></script>'
            )
            # Use a single Apple icon link even on the independently maintained
            # domestic site, which already has its own favicon configuration.
            updated = re.sub(r'<link\b[^>]*\brel=["\']apple-touch-icon["\'][^>]*>\s*', '', source)
            updated = updated.replace('</head>', hooks + '</head>', 1)
            if updated != source:
                # Candidates may hard-link unchanged media and documents from
                # production. Always replace the inode rather than edit it.
                temporary = page.with_name(page.name + '.pwa-next')
                temporary.write_text(updated)
                temporary.chmod(stat.S_IMODE(page.stat().st_mode))
                os.replace(temporary, page)
                changed.append(page.relative_to(root).as_posix())
    return changed


if __name__ == '__main__':
    languages = tuple(sys.argv[2:]) or ('cn', 'en')
    assert all(language in ('cn', 'en') for language in languages)
    changed = prepare(Path(sys.argv[1]).resolve(), languages)
    print(f'Added PWA hooks to {len(changed)} official pages')
