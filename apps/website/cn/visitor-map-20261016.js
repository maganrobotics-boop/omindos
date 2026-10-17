/* Reads public aggregate counts only. Visit recording belongs to portal-client. */
(() => {
  'use strict';
  const root = document.querySelector('[data-visitor-map]');
  if (!root) return;
  const find = selector => root.querySelector(selector);
  const totalNode = find('[data-visit-total]');
  const dayNode = find('[data-visit-day]');
  const markers = find('[data-visitor-markers]');
  const countries = find('[data-visitor-countries]');
  const more = find('[data-visitor-more]');
  const moreLabel = find('[data-visitor-more-label]');
  const moreCountries = find('[data-visitor-more-countries]');
  const source = find('[data-visitor-source]');
  const status = find('[data-visitor-status]');
  const retry = find('[data-visitor-retry]');
  const number = new Intl.NumberFormat('zh-CN');
  let regionNames;
  try { regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' }); } catch { /* Region codes remain readable. */ }
  const validCount = value => Number.isSafeInteger(value) && value >= 0;
  const countryName = code => {
    if (code === 'ZZ' || code === 'XX') return '未定位';
    try { return regionNames?.of(code) || code; } catch { return code; }
  };
  const historyCountries = history => {
    if (!history || history.scope !== 'legacy_shared_pages_archive' || history.excludedFromSiteTotal !== true || !Array.isArray(history.countries)) return null;
    const sums = new Map();
    for (const row of history.countries.slice(0, 300)) {
      const candidate = row?.code ?? row?.country;
      const code = typeof candidate === 'string' ? candidate.toUpperCase() : '';
      const visits = row?.visits ?? row?.count;
      if (!/^[A-Z]{2}$/u.test(code) || !validCount(visits)) continue;
      const sum = (sums.get(code) || 0) + visits;
      if (Number.isSafeInteger(sum)) sums.set(code, sum);
    }
    return [...sums].map(([code, visits]) => ({ code, visits })).filter(row => row.visits > 0)
      .sort((a, b) => b.visits - a.visits || a.code.localeCompare(b.code));
  };
  const createRow = (row, index) => {
    const li = document.createElement('li');
    for (const [className, value] of [
      ['om-visits-rank', String(index + 1).padStart(2, '0')],
      ['om-visits-country-name', countryName(row.code)],
      ['om-visits-country-visits', `${number.format(row.visits)} 次页面访问`],
    ]) {
      const span = document.createElement('span'); span.className = className; span.textContent = value; li.append(span);
    }
    return li;
  };
  let hasData = false, eventVersion = 0, loadVersion = 0;
  const render = data => {
    if (!data || data.enabled !== true || data.site !== 'omindos.cn' || data.countType !== 'filtered_page_views' || !validCount(data.total) || !validCount(data.last24Hours)) return false;
    const historical = historyCountries(data.history);
    totalNode.textContent = number.format(data.total);
    dayNode.textContent = number.format(data.last24Hours);
    markers.replaceChildren(); countries.replaceChildren(); moreCountries.replaceChildren();
    more.hidden = !historical || historical.length <= 6;
    if (historical?.length) {
      historical.forEach((row, index) => {
        (index < 6 ? countries : moreCountries).append(createRow(row, index));
        const position = window.ORIGINMIND_COUNTRY_POSITIONS?.[row.code];
        // ZZ historically had a dummy centre point. Never draw unlocated traffic.
        if (row.code === 'ZZ' || row.code === 'XX' || !Array.isArray(position) || position.length !== 2
          || !position.every(value => Number.isFinite(value) && value >= 0 && value <= 100)) return;
        const marker = document.createElement('span'); marker.className = 'om-visits-marker';
        marker.style.setProperty('--marker-x', `${position[0]}%`); marker.style.setProperty('--marker-y', `${position[1]}%`);
        marker.style.setProperty('--marker-size', `${(5 + Math.min(7, Math.log10(row.visits + 1) * 2.2)).toFixed(1)}px`);
        marker.title = `${countryName(row.code)}：${number.format(row.visits)} 次旧 Pages 站点页面访问（非中文官网）`; markers.append(marker);
      });
      moreLabel.textContent = `更多地区（${number.format(Math.max(0, historical.length - 6))} 项）`;
    } else {
      const empty = document.createElement('li'); empty.className = 'om-visits-placeholder';
      empty.textContent = historical ? '暂无已记录的历史地区分布。' : '历史地区分布暂不可用。'; countries.append(empty);
    }
    const historyTotal = validCount(data.history?.total) ? `旧 Pages 站点历史 ${number.format(data.history.total)} 次仅作存档，非中文官网数据。` : '';
    const legacy = validCount(data.legacyCn?.total) ? `中文官网旧口径 ${number.format(data.legacyCn.total)} 次另存，未作机器人过滤。` : '';
    source.textContent = `累计与近 24 小时仅含中文官网新口径的过滤后页面访问，不代表去重人数、真实人数或在线人数。${legacy}${historyTotal}地图仅展示旧 Pages 站点历史地区分布，中文新增访问暂不定位。`;
    status.textContent = '已载入中文官网页面访问统计'; retry.hidden = true; root.dataset.state = 'ready'; hasData = true;
    return true;
  };
  const load = async () => {
    const ownLoad = ++loadVersion, priorEvent = eventVersion;
    const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 6000);
    retry.hidden = true; status.textContent = '正在载入访问统计…';
    try {
      const response = await fetch('/api/visits', { method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (ownLoad !== loadVersion || priorEvent !== eventVersion) return;
      if (!render(data)) throw new Error('invalid');
    } catch {
      if (ownLoad !== loadVersion || priorEvent !== eventVersion) return;
      root.dataset.state = hasData ? 'stale' : 'unavailable';
      status.textContent = hasData ? '更新暂不可用，保留上次载入的数据。' : '访问统计暂不可用，稍后可重试。';
      retry.hidden = false;
      if (!hasData) { countries.replaceChildren(); const empty = document.createElement('li'); empty.className = 'om-visits-placeholder'; empty.textContent = '历史分布暂不可用。'; countries.append(empty); }
    } finally { window.clearTimeout(timer); }
  };
  retry.addEventListener('click', load);
  window.addEventListener('originmind:visit-counted', event => { if (render(event.detail)) ++eventVersion; });
  void load();
})();

