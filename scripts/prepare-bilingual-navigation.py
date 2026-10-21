"""Render matching site navigation without changing route content or services."""
from html import escape
from pathlib import Path
import re
import sys

ROBOTS = [
    ('quadruped', 'Q1 四足巡检机器人', 'Q1 Quadruped'),
    ('tracked', 'T1 履带式巡检机器人', 'T1 Tracked'),
    ('wheeled', 'W1 轮式巡检机器人', 'W1 Wheeled'),
    ('mobile-dual-arm', 'MDA1 移动双臂机器人', 'MDA1 Mobile dual-arm'),
    ('wheel-legged', 'WL1-EDU 轮足机器人', 'WL1-EDU Wheel-legged'),
    ('open-frame', 'PW1-EDU 并联轮足机器人', 'PW1-EDU Parallel-linkage wheel-legged'),
    ('dual-arm', 'DA1-EDU 双臂协同操作平台', 'DA1-EDU Dual-arm'),
]

def navigation(language, route, mobile=False):
    en = language == 'en'
    prefix = '/en/' if en else '/'
    def url(path=''):
        return prefix + path
    def link(href, text):
        current = ' aria-current="page"' if href == url(route) else ''
        external = ' target="_blank" rel="noopener noreferrer"' if href.startswith('https://cloud.') else ''
        return f'<a href="{escape(href, quote=True)}"{current}{external}>{escape(text)}</a>'
    def group(key, label, links):
        active = (' nav-current' if (key == 'robots' and route.startswith('robots/')) or
                  (key == 'omindos' and route in ['omindos/', 'integration/', 'developers/', 'mobility/', 'field-work/', 'field-work/mining/', 'field-work/warehouse/']) else '')
        identity = ('mobile-' if mobile else 'desktop-') + key + '-submenu'
        return f'<details class="bilingual-dropdown{active}" data-site-submenu><summary aria-controls="{identity}" aria-expanded="false">{label}</summary><div class="bilingual-submenu" id="{identity}">{links}</div></details>'
    robots = link(url('robots/'), 'All robot platforms' if en else '全部机器人平台')
    for i, (slug, zh, english) in enumerate(ROBOTS):
        if i in [0,4]:
            title = ('Industrial platforms' if en else '工业应用') if i == 0 else ('Education & research' if en else '教育科研')
            robots += f'<span class="nav-group-label">{escape(title)}</span>'
        robots += link(url('robots/' + slug + '/'), english if en else zh)
    systems = ''.join([
        link(url('omindos/'), 'System overview' if en else '系统概览'),
        link('https://cloud.omindos.cn', 'OmindOS Cloud' if en else '云机器人 Cloud'),
        link(url('integration/'), 'System integration' if en else '系统集成'),
        link(url('developers/'), 'Developer resources' if en else '开发者资源与 API'),
        link(url('field-work/'), 'Applications' if en else '应用场景'),
        link(url('mobility/'), 'Robot demonstrations' if en else '机器人演示'),
        link('https://omindos.cn/learning', 'Robotics courses' if en else '机器人课程'),
    ])
    result = link(url(), 'Home' if en else '首页')
    result += group('robots', 'Robots' if en else '机器人', robots)
    result += group('omindos', 'OmindOS' if en else 'OmindOS 系统', systems)
    result += link(url('about/'), 'About' if en else '关于我们')
    result += link(url('join/'), 'Join us' if en else '加入我们')
    if en or mobile:
        result += link(url('lab/'), 'ARTS Lab')
    if mobile:
        result += link(url('contact/'), 'Contact' if en else '联系我们')
    return result

def update(root):
    changed = []
    for language in ['cn', 'en']:
        for path in sorted((root / language).rglob('*.html')):
            source = path.read_text()
            route = path.relative_to(root / language).as_posix().removesuffix('index.html')
            pattern = r'(<nav\b[^>]*class="(?:desktop-nav (?:main-nav|en-main-nav)|(?:mobile-menu mobile-nav|en-menu-panel))"[^>]*>)([\s\S]*?)(</nav>)'
            def replace(match):
                mobile = 'mobile-menu' in match[1] or 'en-menu-panel' in match[1]
                return match[1] + navigation(language, route, mobile) + match[3]
            updated, count = re.subn(pattern, replace, source)
            if not count:
                continue
            assert count == 2, f'Expected desktop and mobile nav in {path}'
            if 'bilingual-navigation-20261018.css' not in updated:
                assets = '<link rel="stylesheet" href="/assets/bilingual-navigation-20261018.css?v=1"><script src="/assets/bilingual-navigation-20261018.js?v=1" defer></script>'
                updated = updated.replace('</head>', assets + '</head>', 1)
            if updated != source:
                path.write_text(updated)
                changed.append(path)
    return changed

if __name__ == '__main__':
    changed = update(Path(sys.argv[1]).resolve())
    print(f'Updated bilingual navigation in {len(changed)} pages')
