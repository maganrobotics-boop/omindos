"""Render the shared Chinese header/footer without changing page content."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / 'apps/website'
NAV = [('机器人', '/robots/'), ('OmindOS', '/omindos/'), ('系统集成', '/integration/'),
       ('应用场景', '/field-work/'), ('演示视频', '/mobility/'), ('关于我们', '/about/'), ('加入我们', '/join/')]

def english_url(route):
    if route in {'/join/', '/careers/', '/lab/', '/lab/join/'}:
        return 'https://omindos.ai/en/'
    return 'https://omindos.ai/en' + route

def nav_links(route, contact=False):
    items = NAV + ([('联系我们', '/contact/')] if contact else [])
    return ''.join(f'<a href="{url}"' + (' aria-current="page"' if route.startswith(url) or (url == '/join/' and route.startswith(('/careers/', '/lab/'))) else '') + f'>{label}</a>' for label, url in items)

def header(route):
    return f'''<header class="site-header cn-header">
  <div class="header-row header-inner">
    <a class="wordmark brand" href="/" aria-label="OriginMind 首页"><img src="/assets/originmind-mark-184.webp" width="29" height="29" alt=""><span>OriginMind</span></a>
    <nav class="desktop-nav main-nav" aria-label="主导航">{nav_links(route)}</nav>
    <a class="header-contact" href="/contact/"{' aria-current="page"' if route == '/contact/' else ''}>联系我们</a>
    <nav class="locale-switch" aria-label="切换语言"><a href="{route}" lang="zh-CN" hreflang="zh-CN" aria-current="page">中文</a><span class="slash" aria-hidden="true">/</span><a href="{english_url(route)}" lang="en" hreflang="en" aria-label="English website">EN</a></nav>
    <button class="menu-button menu-toggle" type="button" aria-controls="mobile-menu" aria-expanded="false" aria-label="打开菜单"><span></span><span></span></button>
  </div>
  <nav class="mobile-menu mobile-nav" id="mobile-menu" aria-label="移动端导航" hidden>{nav_links(route, True)}</nav>
</header>'''

def invitation(source):
    found = re.search(r'<div class="footer-invitation">', source)
    if not found:
        return ''
    depth = 0
    for m in re.finditer(r'</?div\b[^>]*>', source[found.start():]):
        depth += -1 if m[0].startswith('</') else 1
        if depth == 0:
            return source[found.start():found.start() + m.end()]
    raise ValueError('Unclosed footer invitation')

def footer(route, lead):
    return f'''<footer class="site-footer cn-footer"><div class="cn-footer-wrap">
{lead}
<div class="cn-footer-grid">
  <div class="cn-footer-brand"><a class="cn-footer-wordmark" href="/" aria-label="OriginMind 首页">OriginMind</a><p>矿山机器人与数字孪生<br>中国 · 深圳</p><a href="mailto:sales@omindos.ai">sales@omindos.ai</a><a class="cn-top-link" href="#main-content">回到顶部</a></div>
  <div><h3>产品与技术</h3><nav aria-label="产品与技术"><a href="/robots/">机器人平台</a><a href="/omindos/">OmindOS</a><a href="/integration/">系统集成</a><a href="/field-work/">应用场景</a><a href="/mobility/">演示视频</a></nav><details class="cn-research-links"><summary>科研与教学平台</summary><nav aria-label="科研与教学平台"><a href="/robots/mobile-dual-arm/">MDA1 移动双臂机器人</a><a href="/robots/dual-arm/">DA1-EDU 双臂协同操作平台</a><a href="/robots/wheel-legged/">WL1-EDU 轮足机器人</a><a href="/robots/open-frame/">PW1-EDU 并联轮足机器人</a></nav></details></div>
  <div><h3>探索与学习</h3><nav aria-label="探索与学习"><a href="https://omindos.cn/learning" target="_blank" rel="noopener noreferrer">机器人课程</a><a href="https://omindos.cn/chat/" target="_blank" rel="noopener noreferrer">AI 助手</a><a href="https://omindos.cn/arena/">机器人竞技场</a><a href="https://cloud.omindos.cn/" target="_blank" rel="noopener noreferrer">云机器人</a><a href="https://oa.omindos.cn/" target="_blank" rel="noopener noreferrer">OA 工作台</a></nav></div>
  <div><h3>关于 OriginMind</h3><nav aria-label="关于 OriginMind"><a href="/about/">关于团队</a><a href="/join/">加入我们</a><a href="/careers/">加入源灵</a><a href="/lab/join/">加入实验室</a><a href="/contact/">联系我们</a><a href="/privacy/">隐私说明</a><a href="{english_url(route)}" lang="en" hreflang="en">English</a></nav></div>
</div>
<div class="cn-footer-bottom"><div><span>© 2026 OriginMind</span><span>OriginMind × ARTS Robotics</span></div><div><a href="https://beian.miit.gov.cn/#/recordQuery" target="_blank" rel="noopener noreferrer">粤ICP备2026150214号</a><a href="/">omindos.cn</a></div></div>
</div></footer>'''

for page in sorted((ROOT / 'cn').rglob('*.html')):
    source = page.read_text()
    route = '/' + page.relative_to(ROOT / 'cn').as_posix().removesuffix('index.html')
    source, count = re.subn(r'<header\b[^>]*>.*?</header>', lambda _: header(route), source, count=1, flags=re.S)
    assert count == 1, page
    source, count = re.subn(r'<footer\b[^>]*>.*?</footer>', lambda m: footer(route, invitation(m[0])), source, count=1, flags=re.S)
    assert count == 1, page
    if '/cn/site-shell-20261014.css' not in source:
        source = source.replace('</head>', '<link rel="stylesheet" href="/cn/site-shell-20261014.css"></head>')
    page.write_text(source)
print('Rendered shared shell for', len(list((ROOT / 'cn').rglob('*.html'))), 'Chinese pages.')
