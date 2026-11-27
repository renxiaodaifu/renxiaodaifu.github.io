(() => {
  'use strict';

  const COLORS = ['#73bf69', '#f2cc0c', '#5794f2', '#b877d9', '#ff9830', '#f2495c', '#8ab8ff', '#a352cc'];
  const AXIS = {
    axisLine: {lineStyle: {color: '#2c3235'}},
    axisTick: {show: false},
    axisLabel: {color: '#8e8e8e', fontSize: 11},
    splitLine: {lineStyle: {color: '#22262b'}}
  };

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const state = {range: 'all', type: 'all'};
  let all = [];
  let calDays = {};
  let calCell = null;
  const charts = {};
  const calTip = {node: null};

  const $ = id => document.getElementById(id);

  function esc(text) {
    return String(text).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
  }

  function ymd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function fmtWords(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + ' 万';
    return String(n);
  }

  function chart(id) {
    if (!charts[id]) charts[id] = echarts.init($(id), null, {renderer: 'canvas'});
    return charts[id];
  }

  function baseOption(extra) {
    return Object.assign({
      backgroundColor: 'transparent',
      textStyle: {color: '#d8d9da'},
      grid: {left: 38, right: 16, top: 18, bottom: 24},
      tooltip: {
        backgroundColor: '#1f2329',
        borderColor: '#2c3235',
        textStyle: {color: '#d8d9da', fontSize: 12}
      }
    }, extra);
  }

  function cutoff() {
    if (state.range === 'all') return null;
    const days = Number(state.range);
    const d = new Date();
    d.setDate(d.getDate() - days);
    return ymd(d);
  }

  function filtered() {
    const since = cutoff();
    return all.filter(item =>
      (state.type === 'all' || item.type === state.type) &&
      (!since || item.date >= since)
    );
  }

  function uniqueDays(items) {
    return new Set(items.map(item => item.date));
  }

  function longestStreak(items) {
    const days = [...uniqueDays(items)].sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const day of days) {
      if (prev) {
        const [y, m, d] = prev.split('-').map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        run = ymd({getFullYear: () => next.getUTCFullYear(), getMonth: () => next.getUTCMonth(), getDate: () => next.getUTCDate()}) === day ? run + 1 : 1;
      } else {
        run = 1;
      }
      best = Math.max(best, run);
      prev = day;
    }
    return best;
  }

  function renderKpis(items) {
    const words = items.reduce((sum, item) => sum + item.words, 0);
    const posts = items.filter(item => item.type === 'post').length;
    const wiki = items.filter(item => item.type === 'wiki').length;
    const days = uniqueDays(items).size;
    const cards = [
      [items.length, '条目'],
      [fmtWords(words), '总字数'],
      [posts + ' / ' + wiki, '博客 / 笔记'],
      [days, '活跃天数'],
      [longestStreak(items), '最长连续天数'],
      [items.length ? Math.round(words / items.length) : 0, '平均字数']
    ];
    $('gf-kpis').innerHTML = cards
      .map(([value, label]) => `<div class="gf-kpi"><b>${value}</b><span>${label}</span></div>`)
      .join('');
  }

  function hideCalTip() {
    if (calTip.node && !calTip.node.hidden) {
      calTip.node.hidden = true;
      calTip.node.innerHTML = '';
    }
    calCell = null;
  }

  function placeCalTip(x, y) {
    const node = calTip.node;
    if (!node || node.hidden) return;
    const gap = 14;
    const rect = node.getBoundingClientRect();
    let left = x + gap;
    let top = y + gap;
    if (left + rect.width > window.innerWidth - 8) left = x - rect.width - gap;
    if (top + rect.height > window.innerHeight - 8) top = y - rect.height - gap;
    node.style.left = Math.max(8, left) + 'px';
    node.style.top = Math.max(8, top) + 'px';
  }

  function showCalTip(cell, x, y) {
    const key = cell.dataset.date;
    const dayItems = calDays[key] || [];
    const total = dayItems.length;
    const [year, month, day] = key.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
    const rows = dayItems
      .slice(0, 6)
      .map(item => `<li><span class="gf-cal-tip-kind">${item.type === 'wiki' ? '笔记' : '博客'}</span>${esc(item.title)}</li>`)
      .join('');
    const more = total > 6 ? `<li class="gf-cal-tip-more">…等 ${total} 篇</li>` : '';
    const body = total ? `<ul>${rows}${more}</ul>` : '<div class="gf-cal-tip-none">当天没有产出</div>';

    if (!calTip.node) {
      calTip.node = document.createElement('div');
      calTip.node.className = 'gf-cal-tip';
      document.body.appendChild(calTip.node);
    }
    calTip.node.innerHTML = `<b>${key} ${weekday}</b><div class="gf-cal-tip-meta">${total} 篇</div>${body}`;
    calTip.node.hidden = false;
    placeCalTip(x, y);
  }

  function renderCalendar(items) {
    const counts = {};
    const days = {};
    items.forEach(item => {
      counts[item.date] = (counts[item.date] || 0) + 1;
      (days[item.date] || (days[item.date] = [])).push(item);
    });
    calDays = days;
    hideCalTip();

    if (items.length === 0) {
      $('gf-cal').innerHTML = '<div class="gf-note">没有数据</div>';
      return;
    }

    const dates = Object.keys(counts).sort();
    const end = new Date();
    const earliest = new Date(dates[0] + 'T00:00:00');
    const windowStart = new Date(end);
    windowStart.setDate(windowStart.getDate() - 364);
    const start = earliest > windowStart ? earliest : windowStart;
    start.setDate(start.getDate() - start.getDay());
    const max = Math.max(...Object.values(counts));

    const weeks = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const key = ymd(cursor);
        const count = counts[key] || 0;
        const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
        week.push(`<div class="gf-cal-cell" data-l="${level}" data-date="${key}" aria-label="${key} · ${count} 篇"></div>`);
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(`<div class="gf-cal-week">${week.join('')}</div>`);
    }

    $('gf-cal').innerHTML = `<div class="gf-cal-grid">${weeks.join('')}</div>`;
    $('gf-cal-range').textContent = `${ymd(start)} → ${ymd(end)}`;
  }

  function renderGroups(items) {
    const counts = {};
    items.forEach(item => {
      counts[item.group] = (counts[item.group] || 0) + 1;
    });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = rows.slice(0, 7);
    const rest = rows.slice(7).reduce((sum, row) => sum + row[1], 0);
    if (rest > 0) top.push(['其他', rest]);

    chart('gf-groups').setOption(baseOption({
      tooltip: {trigger: 'item', backgroundColor: '#1f2329', borderColor: '#2c3235', textStyle: {color: '#d8d9da'}},
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 10,
        textStyle: {color: '#8e8e8e', fontSize: 10},
        formatter: name => (name.length > 8 ? name.slice(0, 8) + '…' : name)
      },
      series: [{
        type: 'pie',
        radius: ['36%', '58%'],
        center: ['50%', '38%'],
        itemStyle: {borderColor: '#181b1f', borderWidth: 2},
        label: {show: false},
        data: top.map(([name, value], i) => ({name, value, itemStyle: {color: COLORS[i % COLORS.length]}}))
      }]
    }), true);
  }

  function renderMonthly(items) {
    const months = {};
    items.forEach(item => {
      const month = item.date.slice(0, 7);
      months[month] = (months[month] || 0) + 1;
    });
    const keys = Object.keys(months).sort();
    let running = 0;
    const cumulative = keys.map(key => (running += months[key]));

    chart('gf-monthly').setOption(baseOption({
      tooltip: {trigger: 'axis', backgroundColor: '#1f2329', borderColor: '#2c3235', textStyle: {color: '#d8d9da'}},
      legend: {right: 8, top: 0, textStyle: {color: '#8e8e8e', fontSize: 11}},
      grid: {left: 38, right: 44, top: 28, bottom: 24},
      xAxis: Object.assign({}, AXIS, {type: 'category', data: keys}),
      yAxis: [
        Object.assign({}, AXIS, {type: 'value'}),
        Object.assign({}, AXIS, {type: 'value', splitLine: {show: false}})
      ],
      series: [
        {name: '每月条目', type: 'bar', barMaxWidth: 18, itemStyle: {color: COLORS[2]}, data: keys.map(key => months[key])},
        {name: '累计', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'none', lineStyle: {color: COLORS[0], width: 2}, data: cumulative}
      ]
    }), true);
  }

  function renderTags(items) {
    const counts = {};
    items.forEach(item => {
      (item.tags || []).forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).reverse();

    chart('gf-tags').setOption(baseOption({
      tooltip: {trigger: 'axis', backgroundColor: '#1f2329', borderColor: '#2c3235', textStyle: {color: '#d8d9da'}},
      grid: {left: 90, right: 24, top: 10, bottom: 20},
      xAxis: Object.assign({}, AXIS, {type: 'value', splitNumber: 2, axisLabel: {color: '#8e8e8e', fontSize: 10, formatter: v => (v >= 1000 ? v / 1000 + 'k' : v)}}),
      yAxis: Object.assign({}, AXIS, {type: 'category', data: rows.map(row => row[0]), axisLabel: {color: '#8e8e8e', fontSize: 11, interval: 0}}),
      series: [{
        type: 'bar',
        barMaxWidth: 12,
        itemStyle: {color: COLORS[3], borderRadius: [0, 3, 3, 0]},
        data: rows.map(row => row[1])
      }]
    }), true);
  }

  function renderLength(items) {
    const buckets = [
      [0, 1000, '<1k'], [1000, 2000, '1–2k'], [2000, 3000, '2–3k'],
      [3000, 5000, '3–5k'], [5000, 8000, '5–8k'], [8000, Infinity, '8k+']
    ];
    const data = buckets.map(([min, max]) => items.filter(item => item.words >= min && item.words < max).length);

    chart('gf-length').setOption(baseOption({
      tooltip: {trigger: 'axis', backgroundColor: '#1f2329', borderColor: '#2c3235', textStyle: {color: '#d8d9da'}},
      grid: {left: 38, right: 16, top: 16, bottom: 24},
      xAxis: Object.assign({}, AXIS, {type: 'category', data: buckets.map(b => b[2])}),
      yAxis: Object.assign({}, AXIS, {type: 'value'}),
      series: [{type: 'bar', barMaxWidth: 24, itemStyle: {color: COLORS[1], borderRadius: [3, 3, 0, 0]}, data}]
    }), true);
  }

  function renderHours(items) {
    const hours = new Array(24).fill(0);
    items.forEach(item => {
      if (typeof item.hour === 'number') hours[item.hour]++;
    });

    chart('gf-hours').setOption(baseOption({
      tooltip: {trigger: 'axis', backgroundColor: '#1f2329', borderColor: '#2c3235', textStyle: {color: '#d8d9da'}},
      grid: {left: 34, right: 12, top: 16, bottom: 24},
      xAxis: Object.assign({}, AXIS, {type: 'category', data: hours.map((_, i) => i), axisLabel: {color: '#8e8e8e', fontSize: 10, interval: 3}}),
      yAxis: Object.assign({}, AXIS, {type: 'value'}),
      series: [{type: 'bar', barMaxWidth: 10, itemStyle: {color: COLORS[4]}, data: hours}]
    }), true);
  }

  function renderWeekday(items) {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const counts = new Array(7).fill(0);
    items.forEach(item => {
      if (typeof item.weekday === 'number') counts[item.weekday]++;
    });

    chart('gf-weekday').setOption(baseOption({
      tooltip: {trigger: 'axis', backgroundColor: '#1f2329', borderColor: '#2c3235', textStyle: {color: '#d8d9da'}},
      grid: {left: 34, right: 12, top: 16, bottom: 24},
      xAxis: Object.assign({}, AXIS, {type: 'category', data: names}),
      yAxis: Object.assign({}, AXIS, {type: 'value'}),
      series: [{type: 'bar', barMaxWidth: 20, itemStyle: {color: COLORS[5]}, data: counts}]
    }), true);
  }

  function renderYears(items) {
    const counts = {};
    items.forEach(item => {
      const year = item.date.slice(0, 4);
      counts[year] = (counts[year] || 0) + 1;
    });
    const keys = Object.keys(counts).sort();

    chart('gf-years').setOption(baseOption({
      tooltip: {trigger: 'axis', backgroundColor: '#1f2329', borderColor: '#2c3235', textStyle: {color: '#d8d9da'}},
      grid: {left: 34, right: 12, top: 16, bottom: 24},
      xAxis: Object.assign({}, AXIS, {type: 'category', data: keys}),
      yAxis: Object.assign({}, AXIS, {type: 'value'}),
      series: [{type: 'bar', barMaxWidth: 28, itemStyle: {color: COLORS[6], borderRadius: [3, 3, 0, 0]}, data: keys.map(key => counts[key])}]
    }), true);
  }

  function renderTop(items) {
    const rows = [...items].sort((a, b) => b.words - a.words).slice(0, 10);
    const max = rows.length ? rows[0].words : 1;
    const body = rows.map(item => `
      <tr>
        <td class="gf-title"><a href="${item.url}">${item.title}</a></td>
        <td class="gf-kind">${item.type === 'wiki' ? '笔记' : '博客'}</td>
        <td class="gf-date">${item.date}</td>
        <td class="gf-words">
          <span class="num">${item.words}</span>
          <span class="gf-bar"><i style="width:${Math.round((item.words / max) * 100)}%"></i></span>
        </td>
      </tr>`).join('');
    $('gf-top').innerHTML = `<table class="gf-tbl"><thead><tr><th>标题</th><th>类型</th><th>日期</th><th class="num">字数</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  function renderProjectAvg(items) {
    const groups = {};
    items.forEach(item => {
      if (!groups[item.group]) groups[item.group] = {words: 0, count: 0};
      groups[item.group].words += item.words;
      groups[item.group].count++;
    });
    const rows = Object.entries(groups)
      .map(([name, value]) => [name, Math.round(value.words / value.count)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .reverse();

    chart('gf-project-avg').setOption(baseOption({
      tooltip: {trigger: 'axis', backgroundColor: '#1f2329', borderColor: '#2c3235', textStyle: {color: '#d8d9da'}},
      grid: {left: 96, right: 28, top: 8, bottom: 20},
      xAxis: Object.assign({}, AXIS, {type: 'value', splitNumber: 2, axisLabel: {color: '#8e8e8e', fontSize: 10, formatter: v => (v >= 1000 ? v / 1000 + 'k' : v)}}),
      yAxis: Object.assign({}, AXIS, {type: 'category', data: rows.map(row => row[0]), axisLabel: {color: '#8e8e8e', fontSize: 11, formatter: v => (v.length > 6 ? v.slice(0, 6) + '…' : v)}}),
      series: [{
        type: 'bar',
        barMaxWidth: 12,
        itemStyle: {color: COLORS[0], borderRadius: [0, 3, 3, 0]},
        label: {show: true, position: 'right', color: '#8e8e8e', fontSize: 10},
        data: rows.map(row => row[1])
      }]
    }), true);
  }

  function render() {
    const items = filtered();
    renderKpis(items);
    renderCalendar(items);
    renderGroups(items);
    renderMonthly(items);
    renderTags(items);
    renderLength(items);
    renderHours(items);
    renderWeekday(items);
    renderYears(items);
    renderTop(items);
    renderProjectAvg(items);
  }

  function closeMenus(except) {
    document.querySelectorAll('#stats-app .gf-select.open').forEach(node => {
      if (node !== except) {
        node.classList.remove('open');
        node.querySelector('.gf-select-btn').setAttribute('aria-expanded', 'false');
      }
    });
  }

  function setupSelect(id, onChange) {
    const root = $(id);
    const button = root.querySelector('.gf-select-btn');
    const label = root.querySelector('.gf-select-label');
    const menu = root.querySelector('.gf-select-menu');

    button.addEventListener('click', event => {
      event.stopPropagation();
      const willOpen = !root.classList.contains('open');
      closeMenus(root);
      root.classList.toggle('open', willOpen);
      button.setAttribute('aria-expanded', String(willOpen));
    });

    menu.addEventListener('click', event => {
      const item = event.target.closest('li[data-value]');
      if (!item) return;
      root.dataset.value = item.dataset.value;
      label.textContent = item.textContent;
      menu.querySelectorAll('li').forEach(node => node.classList.toggle('is-active', node === item));
      root.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
      onChange(item.dataset.value);
    });
  }

  function bind() {
    setupSelect('gf-range', value => {
      state.range = value;
      render();
    });
    setupSelect('gf-type', value => {
      state.type = value;
      render();
    });
    const cal = $('gf-cal');
    cal.addEventListener('mousemove', event => {
      const cell = event.target.closest('.gf-cal-cell');
      if (cell !== calCell) {
        calCell = cell;
        if (cell) showCalTip(cell, event.clientX, event.clientY);
        else hideCalTip();
      } else if (cell) {
        placeCalTip(event.clientX, event.clientY);
      }
    });
    cal.addEventListener('mouseleave', hideCalTip);
    window.addEventListener('scroll', hideCalTip, {passive: true});
    document.addEventListener('click', () => closeMenus());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenus();
    });
    window.addEventListener('resize', () => {
      Object.values(charts).forEach(instance => instance.resize());
    });
  }

  function boot(payload) {
    all = payload.items || [];
    $('gf-build').textContent = '构建于 ' + new Date(payload.generated_at).toLocaleString('zh-CN', {hour12: false});
    bind();
    render();
  }

  fetch('/stats.json')
    .then(response => response.json())
    .then(boot)
    .catch(error => {
      $('stats-app').innerHTML = '<div class="gf-note">统计数据加载失败：' + error.message + '</div>';
    });
})();
