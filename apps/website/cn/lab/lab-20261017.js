/* Public alumni pages read only the public API and never require a login. */
(function () {
  'use strict';

  var API = '/learning/api/alumni/public';
  var directory = document.querySelector('[data-alumni-directory]');
  var profileRoot = document.querySelector('[data-alumni-profile]');

  function text(value) {
    return typeof value === 'string' ? value.trim() : (typeof value === 'number' ? String(value) : '');
  }

  function node(tag, className, value) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function yearLabel(value) {
    var year = text(value);
    return year ? year.replace(/\s*届$/, '') + ' 届' : '毕业生';
  }

  function memberUrl(id) {
    return '/lab/alumni/?' + new URLSearchParams({ id: id }).toString();
  }

  async function readPublic(url) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 10000);
    try {
      var response = await fetch(url, {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) {
        var error = new Error('public_request_failed');
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  function showError(root, message, retry) {
    root.replaceChildren();
    root.setAttribute('aria-busy', 'false');
    var container = node('div', 'lab-status');
    var notice = node('p', '', message);
    notice.setAttribute('role', 'status');
    container.appendChild(notice);
    if (retry) {
      var button = node('button', 'lab-retry', '重新加载');
      button.type = 'button';
      button.addEventListener('click', retry);
      container.appendChild(button);
    }
    root.appendChild(container);
  }

  function showLoading(root, message) {
    root.setAttribute('aria-busy', 'true');
    var notice = node('p', 'lab-status', message);
    notice.setAttribute('role', 'status');
    root.replaceChildren(notice);
  }

  async function loadDirectory() {
    showLoading(directory, '正在加载毕业生目录…');
    try {
      var data = await readPublic(API);
      if (!data || !Array.isArray(data.members)) throw new Error('invalid_public_response');
      var seen = new Set();
      var groups = new Map();
      data.members.forEach(function (member) {
        if (!member || typeof member !== 'object') return;
        var id = text(member.id);
        var name = text(member.name);
        if (!id || !name || seen.has(id)) return;
        seen.add(id);
        var year = text(member.graduationYear);
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push({ id: id, name: name, published: member.published === true, summary: text(member.summary) });
      });
      directory.replaceChildren();
      if (!seen.size) {
        var empty = node('p', 'lab-status', '毕业生目录正在整理中。');
        empty.setAttribute('role', 'status');
        directory.appendChild(empty);
      }
      Array.from(groups.keys()).sort(function (a, b) {
        if (!a) return 1;
        if (!b) return -1;
        return b.localeCompare(a, 'zh-CN', { numeric: true });
      }).forEach(function (year) {
        var members = groups.get(year);
        var group = node('section', 'lab-alumni-group');
        var heading = node('div', 'lab-year-heading');
        heading.appendChild(node('h3', '', yearLabel(year)));
        heading.appendChild(node('span', '', members.length + ' 人'));
        group.appendChild(heading);
        var list = node('ul', 'lab-alumni-list');
        members.forEach(function (member) {
          var item = node('li');
          var link = node('a', 'lab-alumni-link');
          link.href = memberUrl(member.id);
          link.appendChild(node('span', 'lab-alumni-name', member.name));
          link.appendChild(node('span', 'lab-alumni-summary', member.published ? (member.summary || '查看个人主页') : '资料待本人完善'));
          item.appendChild(link);
          list.appendChild(item);
        });
        group.appendChild(list);
        directory.appendChild(group);
      });
      directory.setAttribute('aria-busy', 'false');
    } catch (error) {
      showError(directory, '毕业生目录暂未载入，请稍后重试。', loadDirectory);
    }
  }

  function safeHttpUrl(value) {
    try {
      var url = new URL(text(value), window.location.origin);
      return (url.protocol === 'https:' || url.protocol === 'http:') && text(value) ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function joined(values) {
    return values.map(text).filter(Boolean).join(' · ');
  }

  function yearRange(item) {
    var start = text(item.startYear);
    var end = text(item.endYear);
    return start && end ? start + '—' + end : start || end;
  }

  function section(title, entries) {
    if (!entries.length) return null;
    var result = node('section', 'alumni-profile-section');
    result.appendChild(node('h2', '', title));
    var list = node('ul', 'alumni-entry-list');
    entries.forEach(function (entry) {
      var item = node('li', 'alumni-entry');
      if (entry.title) item.appendChild(node('h3', '', entry.title));
      if (entry.meta) item.appendChild(node('p', 'alumni-entry-meta', entry.meta));
      if (entry.description) item.appendChild(node('p', 'alumni-entry-description', entry.description));
      if (entry.url) {
        var link = node('a', 'lab-text-link', '查看成果');
        link.href = entry.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.appendChild(link);
      }
      list.appendChild(item);
    });
    result.appendChild(list);
    return result;
  }

  function array(value) {
    return Array.isArray(value) ? value.filter(function (item) { return item && typeof item === 'object'; }) : [];
  }

  function categoryVisible(visibility, key) {
    return !visibility || visibility[key] !== false;
  }

  function renderProfile(member) {
    var published = member.published === true;
    var profile = published && member.profile && typeof member.profile === 'object' ? member.profile : {};
    var visibility = member.visibility && typeof member.visibility === 'object' ? member.visibility : null;
    var name = (published && text(profile.displayName)) || text(member.name) || '毕业生';
    profileRoot.replaceChildren();
    var heading = node('header', 'alumni-heading');
    heading.appendChild(node('p', 'lab-eyebrow', yearLabel(member.graduationYear) + ' · ARTS Robotics'));
    heading.appendChild(node('h1', '', name));
    var bioVisible = published && categoryVisible(visibility, 'bio') && text(profile.bio);
    if (bioVisible) heading.appendChild(node('p', 'alumni-bio', text(profile.bio)));
    profileRoot.appendChild(heading);
    document.title = name + ' · ARTS Robotics';
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && text(member.id)) canonical.href = 'https://omindos.cn' + memberUrl(text(member.id));
    if (!published) {
      profileRoot.appendChild(node('p', 'alumni-pending', '资料待本人完善'));
      return;
    }
    var sections = [];
    if (categoryVisible(visibility, 'education')) {
      sections.push(section('教育经历', array(profile.education).map(function (item) {
        return { title: text(item.school), meta: joined([item.degree, item.major, yearRange(item)]) };
      }).filter(function (entry) { return entry.title || entry.meta; })));
    }
    if (categoryVisible(visibility, 'current') && profile.current && typeof profile.current === 'object') {
      var current = profile.current;
      var label = current.status === 'study' ? '目前深造' : current.status === 'employment' ? '目前工作' : '近况';
      var currentEntry = { title: text(current.organization), meta: joined([current.title, current.since]), description: text(current.description) };
      if (currentEntry.title || currentEntry.meta || currentEntry.description) sections.push(section(label, [currentEntry]));
    }
    if (categoryVisible(visibility, 'awards')) {
      sections.push(section('在读期间奖励', array(profile.awards).map(function (item) {
        return { title: text(item.name), meta: joined([item.year, item.level]), description: text(item.description) };
      }).filter(function (entry) { return entry.title || entry.meta || entry.description; })));
    }
    if (categoryVisible(visibility, 'achievements')) {
      sections.push(section('研究与成果', array(profile.achievements).map(function (item) {
        return { title: text(item.title), meta: joined([item.kind, item.year]), description: text(item.description), url: safeHttpUrl(item.url) };
      }).filter(function (entry) { return entry.title || entry.meta || entry.description || entry.url; })));
    }
    sections.filter(Boolean).forEach(function (item) { profileRoot.appendChild(item); });
    if (!sections.filter(Boolean).length && !bioVisible) profileRoot.appendChild(node('p', 'alumni-pending', '暂无公开资料。'));
  }

  async function loadProfile() {
    var id = text(new URLSearchParams(window.location.search).get('id'));
    if (!id || id.length > 160) {
      showError(profileRoot, '请从实验室毕业生目录选择个人主页。');
      return;
    }
    showLoading(profileRoot, '正在加载毕业生主页…');
    try {
      var data = await readPublic(API + '/' + encodeURIComponent(id));
      if (!data || !data.member || typeof data.member !== 'object') throw new Error('invalid_public_response');
      renderProfile(data.member);
      profileRoot.setAttribute('aria-busy', 'false');
    } catch (error) {
      showError(profileRoot, error.status === 404 ? '暂未找到这个毕业生主页。' : '个人主页暂未载入，请稍后重试。', error.status === 404 ? null : loadProfile);
    }
  }

  if (directory) loadDirectory();
  if (profileRoot) loadProfile();
}());
