/* Chinese lab summaries. Original content remains available without JavaScript. */
(function () {
  'use strict';
  if (!/^zh(?:-|$)/i.test(document.documentElement.lang) || !document.body.classList.contains('lab-page') || document.body.classList.contains('lab-summary-enabled')) return;

  var states = [];
  var pending = 0;
  var configs = [
    ['#research', '研究方向', '.lab-directions > .lab-direction'],
    ['#research-platforms', '实验平台', '.lab-platform-grid > .lab-platform-card'],
    ['#lab-projects', '创新训练项目', '.lab-chronology > .lab-chronology-entry'],
    ['#lab-publications', '论文', '.lab-chronology > .lab-chronology-entry'],
    ['#lab-patents', '专利', '.lab-chronology > .lab-chronology-entry'],
    ['#lab-awards', '获奖与荣誉', '.lab-chronology > .lab-chronology-entry'],
    ['.lab-results-demos', '系统研究演示', '.lab-result-grid > article, .lab-practice'],
    ['#exchange', '交流与合作', '.lab-wrap > .lab-team-photo, .lab-wrap > .lab-cooperation, .lab-wrap > .lab-events-heading, .lab-wrap > .lab-activity-gallery, .lab-wrap > .lab-exchange-grid, .lab-wrap > .lab-updates'],
    ['#alumni', '毕业生', '.lab-wrap > .lab-graduation-photo, [data-alumni-directory], .lab-wrap > .lab-alumni-invitation, .lab-wrap > .lab-account-settings']
  ];

  document.body.classList.add('lab-summary-enabled');

  function schedule() {
    if (pending) return;
    pending = window.requestAnimationFrame(function () {
      pending = 0;
      states.forEach(measure);
    });
  }

  function measure(state) {
    var items = Array.from(state.root.querySelectorAll(state.selector));
    if (!items.length) return;
    // Only restore nodes hidden by this script; never change details/open or other hidden state.
    items.forEach(function (item) { item.classList.remove('lab-summary-hidden'); });
    state.actions.hidden = false;
    var rootRect = state.root.getBoundingClientRect();
    var header = document.querySelector('.site-header');
    var headerHeight = header ? header.getBoundingClientRect().height : 0;
    var viewport = document.documentElement.clientHeight || window.innerHeight;
    var pageHeight = Math.max(300, viewport - headerHeight - 16);
    var lastRect = items[items.length - 1].getBoundingClientRect();
    // Preserve the existing trailing notes/padding and reserve room for the button.
    var tail = Math.max(0, rootRect.bottom - lastRect.bottom);
    var limit = rootRect.top + pageHeight - tail;
    var rows = [];
    items.forEach(function (item, index) {
      if (!item.id) item.id = 'lab-summary-' + state.index + '-' + index;
      var rect = item.getBoundingClientRect();
      var row = rows[rows.length - 1];
      if (row && Math.abs(row.top - rect.top) < 3) {
        row.nodes.push(item);
        row.bottom = Math.max(row.bottom, rect.bottom);
      } else rows.push({ top: rect.top, bottom: rect.bottom, nodes: [item] });
    });
    // An activity heading belongs to the following gallery; do not leave it orphaned.
    rows.forEach(function (row, index) {
      if (row.nodes.some(function (node) { return node.classList.contains('lab-events-heading'); }) && rows[index + 1]) {
        rows[index + 1].nodes = row.nodes.concat(rows[index + 1].nodes);
        row.nodes = [];
      }
    });
    rows = rows.filter(function (row) { return row.nodes.length; });
    var keep = 0;
    rows.some(function (row, index) {
      if (index === 0 || row.bottom <= limit + 1) { keep = index + 1; return false; }
      return true;
    });
    var hiddenRows = rows.slice(keep);
    var hasMore = hiddenRows.length > 0;
    if (!state.expanded) hiddenRows.forEach(function (row) {
      row.nodes.forEach(function (item) { item.classList.add('lab-summary-hidden'); });
    });
    state.actions.hidden = !hasMore;
    state.button.textContent = state.expanded ? '收起' : '更多';
    state.button.setAttribute('aria-expanded', String(state.expanded));
    state.button.setAttribute('aria-controls', items.map(function (item) { return item.id; }).join(' '));
    state.button.setAttribute('aria-label', (state.expanded ? '收起' : '展开全部') + state.title);
    state.root.dataset.labSummaryState = state.expanded ? 'expanded' : 'collapsed';
    // Keep a focused link/control visible if a responsive recalculation would hide it.
    var focused = document.activeElement;
    if (!state.expanded && focused && items.some(function (item) {
      return item.classList.contains('lab-summary-hidden') && item.contains(focused);
    })) {
      state.expanded = true;
      measure(state);
    }
  }

  configs.forEach(function (config, index) {
    var root = document.querySelector(config[0]);
    if (!root) return;
    var host = root.querySelector(':scope > .lab-wrap') || root;
    var actions = document.createElement('div');
    actions.className = 'lab-summary-actions';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'lab-summary-toggle';
    button.textContent = '更多';
    actions.appendChild(button);
    host.appendChild(actions);
    root.classList.add('lab-summary-section');
    var state = { root: root, title: config[1], selector: config[2], actions: actions, button: button, expanded: false, index: index };
    states.push(state);
    button.addEventListener('click', function () {
      state.expanded = !state.expanded;
      // The active control remains outside the content that is being collapsed.
      button.focus({ preventScroll: true });
      measure(state);
      if (!state.expanded) {
        var header = document.querySelector('.site-header');
        var offset = header ? header.getBoundingClientRect().height : 0;
        var top = root.getBoundingClientRect().top + window.scrollY - offset - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
      }
    });
  });

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule);
  window.addEventListener('lab-summary:refresh', schedule);
  document.addEventListener('load', function (event) {
    if (event.target.matches && event.target.matches('.lab-page img')) schedule();
  }, true);
  document.addEventListener('loadedmetadata', schedule, true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  var directory = document.querySelector('[data-alumni-directory]');
  if (directory) new MutationObserver(schedule).observe(directory, { childList: true, subtree: true });
  schedule();
}());
