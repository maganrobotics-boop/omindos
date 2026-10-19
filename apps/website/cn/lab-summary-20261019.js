/* Progressive enhancement: without JavaScript the complete lists remain visible. */
(function () {
  'use strict';

  var groups = [];
  document.querySelectorAll('[data-lab-summary]').forEach(function (section) {
    var list = section.querySelector('.lab-chronology');
    if (!list || list.children.length < 2) return;
    var items = Array.from(list.children);
    var label = section.getAttribute('data-lab-summary');
    list.id = section.id + '-list';

    var controls = document.createElement('div');
    controls.className = 'lab-summary-controls';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'lab-summary-toggle';
    button.setAttribute('aria-controls', list.id);
    var count = document.createElement('p');
    count.className = 'lab-summary-count';
    count.setAttribute('aria-live', 'polite');
    controls.append(button, count);
    list.after(controls);

    var group = { section: section, list: list, items: items, controls: controls,
      button: button, count: count, label: label, expanded: false, limit: 3 };
    groups.push(group);

    button.addEventListener('click', function () {
      group.expanded = !group.expanded;
      update(group);
      if (!group.expanded && section.getBoundingClientRect().top < 0) {
        section.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    });
  });

  function update(group) {
    group.items.forEach(function (item, index) {
      item.hidden = !group.expanded && index >= group.limit;
    });
    group.controls.hidden = group.limit >= group.items.length;
    group.button.setAttribute('aria-expanded', String(group.expanded));
    group.button.textContent = group.expanded ? '收起' + group.label :
      '查看更多' + group.label + '（共 ' + group.items.length + ' 项）';
    group.count.textContent = '已显示 ' + (group.expanded ? group.items.length : group.limit) +
      ' / ' + group.items.length + ' 项';
  }

  function measure() {
    var header = document.querySelector('.site-header');
    var headerHeight = header ? header.getBoundingClientRect().height : 80;
    groups.forEach(function (group) {
      group.items.forEach(function (item) { item.hidden = false; });
      group.controls.hidden = false;
      var sectionStyle = window.getComputedStyle(group.section);
      var beforeList = group.list.getBoundingClientRect().top - group.section.getBoundingClientRect().top;
      var reserved = beforeList + parseFloat(sectionStyle.paddingBottom || 0) +
        headerHeight + group.controls.getBoundingClientRect().height + 44;
      var available = Math.max(120, window.innerHeight - reserved);
      var height = 0;
      var limit = 0;
      for (var index = 0; index < Math.min(3, group.items.length); index += 1) {
        var nextHeight = group.items[index].getBoundingClientRect().height;
        if (limit > 0 && height + nextHeight > available) break;
        height += nextHeight;
        limit += 1;
      }
      group.limit = Math.max(1, limit);
      update(group);
    });
  }

  var pending;
  window.addEventListener('resize', function () {
    window.clearTimeout(pending);
    pending = window.setTimeout(measure, 150);
  });
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
}());
