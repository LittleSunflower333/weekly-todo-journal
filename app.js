'use strict';

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const INITIAL_LOAD = 8;
const LOAD_BATCH = 8;
const DEFAULT_EXPANDED = 3;

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDate(key) { return new Date(`${key}T12:00:00`); }
function shiftDate(key, days) { const d = parseDate(key); d.setDate(d.getDate() + days); return dateKey(d); }
function mondayOf(date = new Date()) { const d = new Date(date); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dateKey(d); }
function uid() { return globalThis.crypto?.randomUUID?.() || `task_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

initApp();

function initApp() {
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const today = dateKey(new Date());
  const thisWeek = mondayOf();
  const loaded = new Map();
  const shown = new Set();
  const opened = new Set();
  const saveTimers = new Map();
  const writeChains = new Map();
  const transientTodos = new Set();
  let index = [];
  let activeId = '';
  let toastTimer;
  let searchTimer;
  let loadingMore = false;

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    let body = null;
    try { body = await response.json(); } catch { /* response body is optional */ }
    if (!response.ok) throw new Error(body?.error || `请求失败（${response.status}）`);
    return body;
  }

  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3600);
  }

  function setSaveStatus(kind, message) {
    const node = $('#save-status');
    node.dataset.state = kind;
    node.innerHTML = `<span></span> ${escape(message)}`;
  }

  function shortDate(key, separator = '.') {
    const d = parseDate(key);
    return `${String(d.getMonth() + 1).padStart(2, '0')}${separator}${String(d.getDate()).padStart(2, '0')}`;
  }
  function range(start) { return `${shortDate(start)} — ${shortDate(shiftDate(start, 6))}`; }
  function fullRange(start) { return `${start} ～ ${shiftDate(start, 6)}`; }
  function isoWeek(key) {
    const d = parseDate(key); d.setDate(d.getDate() + 3);
    const first = new Date(d.getFullYear(), 0, 4, 12);
    return 1 + Math.round((parseDate(mondayOf(d)) - parseDate(mondayOf(first))) / 604800000);
  }
  function progress(week) {
    const tasks = week.days.flatMap(day => day.tasks);
    return { total: tasks.length, done: tasks.filter(task => task.done).length };
  }

  function normalizeWeek(week) {
    week.focus ||= [];
    week.days ||= [];
    week.summary ||= { highlight: '', blocked: '', nextWeek: '' };
    return week;
  }

  async function loadWeek(startDate) {
    if (loaded.has(startDate)) return loaded.get(startDate);
    const week = normalizeWeek(await request(`/api/weeks/${startDate}`));
    loaded.set(startDate, week);
    return week;
  }

  async function loadIds(ids) {
    const settled = await Promise.allSettled(ids.map(loadWeek));
    const failed = settled.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }

  function saveWeek(week, immediate = false) {
    clearTimeout(saveTimers.get(week.startDate));
    const perform = () => {
      const snapshot = JSON.parse(JSON.stringify(week));
      snapshot.days.forEach(day => { day.tasks = day.tasks.filter(task => !transientTodos.has(task.id)); });
      const previous = writeChains.get(week.startDate) || Promise.resolve();
      const current = previous.catch(() => {}).then(async () => {
        setSaveStatus('saving', '正在保存…');
        await request(`/api/weeks/${week.startDate}`, { method: 'PUT', body: JSON.stringify(snapshot) });
        setSaveStatus('saved', '已保存到本地 JSON');
      }).catch(error => {
        setSaveStatus('error', '保存失败');
        toast(`保存失败：${error.message}`);
      });
      writeChains.set(week.startDate, current);
      return current;
    };
    if (immediate) return perform();
    setSaveStatus('saving', '正在保存…');
    saveTimers.set(week.startDate, setTimeout(perform, 650));
  }

  function autoSize(root = document) {
    root.querySelectorAll('textarea').forEach(el => {
      if (!el.getClientRects().length) return;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, el.classList.contains('todo-text') ? 23 : 30)}px`;
    });
    root.querySelectorAll('.journal-preview').forEach(el => {
      if (el.clientHeight) el.style.setProperty('--journal-lines', Math.max(1, Math.floor(el.clientHeight / 20)));
    });
  }

  function renderNav() {
    const groups = {};
    index.forEach(meta => {
      const year = meta.startDate.slice(0, 4), month = meta.startDate.slice(5, 7);
      ((groups[year] ||= {})[month] ||= []).push(meta);
    });
    $('#archive').innerHTML = Object.keys(groups).sort().reverse().map(year =>
      `<details class="year-group" open><summary>${year}</summary>${Object.keys(groups[year]).sort().reverse().map(month =>
        `<details class="month-group" open><summary>${Number(month)} 月</summary>${groups[year][month].map(meta =>
          `<button class="week-nav ${meta.startDate === activeId ? 'active' : ''}" data-jump="${meta.startDate}" ${meta.startDate === activeId ? 'aria-current="date"' : ''}>${range(meta.startDate)}<small>W${isoWeek(meta.startDate)}</small></button>`
        ).join('')}</details>`
      ).join('')}</details>`
    ).join('');
  }

  function renderTodo(todo) {
    return `<div class="todo ${todo.done ? 'done' : ''}" data-todo="${escape(todo.id)}"><input type="checkbox" aria-label="完成任务：${escape(todo.text)}" ${todo.done ? 'checked' : ''}><textarea rows="1" class="todo-text" aria-label="编辑任务" placeholder="写下一件要做的事…">${escape(todo.text)}</textarea><button class="todo-remove" data-action="remove-todo" aria-label="删除任务：${escape(todo.text)}">×</button></div>`;
  }

  function renderWeek(week) {
    const p = progress(week), start = week.startDate;
    return `<article class="week-card ${opened.has(start) ? '' : 'collapsed'}" id="week-${start}" data-week="${start}">
      <div class="week-header"><button class="week-toggle" data-action="toggle" aria-expanded="${opened.has(start)}"><span class="chevron">›</span><span class="week-title"><span class="year">${start.slice(0, 4)}</span>${range(start)}</span></button>${start === thisWeek ? '<span class="week-badge">本周</span>' : ''}
        <div class="week-tools"><span class="progress-mini"><span class="progress-track"><i style="width:${p.total ? p.done / p.total * 100 : 0}%"></i></span><span class="progress-text">${p.done} / ${p.total}</span></span><button class="week-delete" data-action="delete-week" aria-label="删除这一周" title="删除这一周">×</button></div>
      </div>
      ${opened.has(start) ? `<div class="week-body"><section class="focus-block"><label class="section-label" for="focus-${start}"><span class="sun">☀</span> 本周重点</label><textarea id="focus-${start}" data-field="focus" rows="2" placeholder="这周，最想做好哪几件事？">${escape(week.focus.join('\n'))}</textarea></section>
      <div class="days-heading" aria-hidden="true"><span>日期</span><span>待办事项</span><span>🌱 每日随笔</span></div>
      <div class="days">${week.days.map((day, i) => `<section class="day-row ${day.date === today ? 'today-row' : ''} ${i > 4 ? 'weekend' : ''}" data-day="${day.date}" id="day-${day.date}"><div class="day-date"><div class="day-name">${DAY_NAMES[i]}${day.date === today ? '<span class="today-pill">今天</span>' : ''}</div><time class="day-number" datetime="${day.date}" title="${day.date}"><span class="date-month">${day.date.slice(5, 7)} / </span>${day.date.slice(8)}</time></div><div class="tasks"><div class="todo-list">${day.tasks.map(renderTodo).join('')}</div><button class="add-todo" data-action="add-todo" aria-label="给${DAY_NAMES[i]}添加待办" title="添加待办">＋ 添加待办</button></div><div class="journal"><span class="journal-leaf">🌱 随笔</span><button class="journal-preview" data-action="edit-journal" aria-label="编辑${DAY_NAMES[i]}的记录" title="点击编辑"><span class="journal-preview-text ${day.note ? '' : 'is-empty'}">${escape(day.note) || '记下此刻的心情、生活或想法…'}</span></button><textarea id="note-${day.date}" data-field="note" aria-label="编辑${DAY_NAMES[i]}的记录" placeholder="记下此刻的心情、生活或想法…">${escape(day.note)}</textarea></div></section>`).join('')}</div>
      <section class="review"><div class="review-heading"><span>↳</span> 本周小结</div><div class="review-grid">${[['highlight','亮点','有什么值得为自己开心的？'],['blocked','卡住的问题','什么事还需要一点时间？'],['nextWeek','下周要关注','把一点期待留给下周。']].map(([key,title,placeholder]) => `<div class="review-cell"><label for="${key}-${start}"><i></i>${title}</label><textarea id="${key}-${start}" data-summary="${key}" rows="2" placeholder="${placeholder}">${escape(week.summary[key])}</textarea></div>`).join('')}</div></section></div>` : ''}
    </article>`;
  }

  function render() {
    renderNav();
    const visible = index.filter(meta => shown.has(meta.startDate)).map(meta => loaded.get(meta.startDate)).filter(Boolean);
    $('#weeks').innerHTML = visible.map(renderWeek).join('') || '<div class="empty-state">这里还没有记录。点击右上角「＋」，创建这一周。</div>';
    const remaining = index.filter(meta => !shown.has(meta.startDate)).length;
    $('#load-more').disabled = !remaining || loadingMore;
    $('#load-more').textContent = loadingMore ? '正在读取…' : remaining ? `↓  加载更早记录 · 还有 ${remaining} 周` : '已展示全部周次';
    autoSize();
  }

  async function jump(startDate, day) {
    if (!index.some(meta => meta.startDate === startDate)) return;
    try {
      await loadWeek(startDate);
      shown.add(startDate); opened.add(startDate); activeId = startDate;
      render(); closeSidebar();
      requestAnimationFrame(() => {
        const article = document.getElementById(`week-${startDate}`);
        const target = day ? document.getElementById(`day-${day}`) : article;
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target?.classList.add('jump-flash');
      });
    } catch (error) { toast(`无法读取这一周：${error.message}`); }
  }

  function context(el) {
    const week = loaded.get(el.closest('[data-week]')?.dataset.week);
    const day = week?.days.find(item => item.date === el.closest('[data-day]')?.dataset.day);
    const todo = day?.tasks.find(item => item.id === el.closest('[data-todo]')?.dataset.todo);
    return { week, day, todo };
  }

  function updateProgress(week) {
    const p = progress(week), article = document.getElementById(`week-${week.startDate}`);
    if (!article) return;
    article.querySelector('.progress-text').textContent = `${p.done} / ${p.total}`;
    article.querySelector('.progress-track i').style.width = `${p.total ? p.done / p.total * 100 : 0}%`;
  }

  $('#weeks').addEventListener('input', event => {
    const el = event.target, { week, day, todo } = context(el);
    if (!week) return;
    if (el.classList.contains('todo-text') && todo) {
      todo.text = el.value;
      if (!transientTodos.has(todo.id)) saveWeek(week);
    }
    else if (el.dataset.field === 'focus') { week.focus = el.value.split('\n').map(line => line.trim()).filter(Boolean); saveWeek(week); }
    else if (el.dataset.field === 'note' && day) { day.note = el.value; saveWeek(week); }
    else if (el.dataset.summary) { week.summary[el.dataset.summary] = el.value; saveWeek(week); }
    autoSize(el.closest('.week-card'));
  });

  $('#weeks').addEventListener('change', event => {
    if (!event.target.matches('.todo input[type=checkbox]')) return;
    const { week, todo } = context(event.target);
    todo.done = event.target.checked;
    event.target.closest('.todo').classList.toggle('done', todo.done);
    updateProgress(week); saveWeek(week, true);
  });

  $('#weeks').addEventListener('keydown', event => {
    if (!event.target.classList.contains('todo-text')) return;
    const { week, day, todo } = context(event.target);
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!todo.text.trim()) {
        day.tasks = day.tasks.filter(item => item.id !== todo.id); transientTodos.delete(todo.id); render();
      } else {
        todo.text = todo.text.trim(); transientTodos.delete(todo.id); event.target.value = todo.text; saveWeek(week, true); event.target.blur();
      }
    } else if (event.key === 'Escape' && transientTodos.has(todo.id)) {
      day.tasks = day.tasks.filter(item => item.id !== todo.id); transientTodos.delete(todo.id); render();
    }
  });

  $('#weeks').addEventListener('focusout', event => {
    if (event.target.classList.contains('todo-text')) {
      const { week, day, todo } = context(event.target);
      if (!todo) return;
      todo.text = todo.text.trim();
      if (!todo.text && transientTodos.has(todo.id)) {
        day.tasks = day.tasks.filter(item => item.id !== todo.id); transientTodos.delete(todo.id); render();
      } else { transientTodos.delete(todo.id); saveWeek(week, true); }
    }
    if (event.target.dataset.field === 'note') {
      const journal = event.target.closest('.journal');
      journal.querySelector('.journal-preview-text').textContent = event.target.value || '记下此刻的心情、生活或想法…';
      journal.querySelector('.journal-preview-text').classList.toggle('is-empty', !event.target.value);
      journal.classList.remove('is-editing');
    }
  });

  $('#weeks').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const { week, day, todo } = context(button);
    if (button.dataset.action === 'toggle') {
      opened.has(week.startDate) ? opened.delete(week.startDate) : opened.add(week.startDate); activeId = week.startDate; render();
    } else if (button.dataset.action === 'add-todo') {
      const task = { id: uid(), text: '', done: false };
      day.tasks.push(task); transientTodos.add(task.id); render();
      document.querySelector(`[data-todo="${CSS.escape(task.id)}"] .todo-text`)?.focus();
    } else if (button.dataset.action === 'remove-todo') {
      day.tasks = day.tasks.filter(item => item.id !== todo.id); transientTodos.delete(todo.id); render(); saveWeek(week, true);
    } else if (button.dataset.action === 'edit-journal') {
      const journal = button.closest('.journal'); journal.classList.add('is-editing');
      const textarea = journal.querySelector('textarea'); textarea.focus(); autoSize(journal); textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    } else if (button.dataset.action === 'delete-week') openDeleteModal(week);
  });

  async function loadMore() {
    if (loadingMore) return;
    const ids = index.filter(meta => !shown.has(meta.startDate)).slice(0, LOAD_BATCH).map(meta => meta.startDate);
    if (!ids.length) return;
    loadingMore = true; render();
    try { await loadIds(ids); ids.forEach(id => shown.add(id)); }
    catch (error) { toast(`加载失败：${error.message}`); }
    finally { loadingMore = false; render(); }
  }
  $('#load-more').addEventListener('click', loadMore);
  const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadMore(); }, { rootMargin: '300px' });
  observer.observe($('#load-more'));

  $('#archive').addEventListener('click', event => { const target = event.target.closest('[data-jump]'); if (target) jump(target.dataset.jump); });

  $('#add-week').addEventListener('click', async () => {
    $('#add-week').disabled = true;
    try {
      const week = normalizeWeek(await request('/api/weeks', { method: 'POST', body: '{}' }));
      index.unshift({ startDate: week.startDate, endDate: week.endDate }); index.sort((a, b) => b.startDate.localeCompare(a.startDate));
      loaded.set(week.startDate, week); shown.add(week.startDate); opened.add(week.startDate); activeId = week.startDate; render();
      requestAnimationFrame(() => document.getElementById(`week-${week.startDate}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      toast(`已创建 ${fullRange(week.startDate)}`);
    } catch (error) { toast(`创建失败：${error.message}`); }
    finally { $('#add-week').disabled = false; }
  });

  function openDeleteModal(week) {
    $('#modal-content').innerHTML = `<div class="modal-head"><h2>删除这一周？</h2><button class="close-modal" aria-label="关闭">×</button></div><p class="modal-description">确定删除 ${fullRange(week.startDate)} 吗？删除后，这一周的任务、随笔和总结都会从本地文件中移除。</p><div class="modal-actions"><button class="secondary-button close-modal">取消</button><button class="danger-button" id="confirm-delete">删除</button></div>`;
    $('#modal').showModal();
    $('#confirm-delete').addEventListener('click', async () => {
      $('#confirm-delete').disabled = true;
      try {
        clearTimeout(saveTimers.get(week.startDate));
        await (writeChains.get(week.startDate) || Promise.resolve());
        await request(`/api/weeks/${week.startDate}`, { method: 'DELETE' });
        index = index.filter(meta => meta.startDate !== week.startDate); loaded.delete(week.startDate); shown.delete(week.startDate); opened.delete(week.startDate);
        activeId = index[0]?.startDate || ''; $('#modal').close(); render(); toast('这一周已删除');
      } catch (error) { toast(`删除失败：${error.message}`); $('#confirm-delete').disabled = false; }
    }, { once: true });
  }

  $('#modal').addEventListener('click', event => { if (event.target === $('#modal') || event.target.closest('.close-modal')) $('#modal').close(); });

  async function performSearch(query) {
    const container = $('#modal-content').querySelector('.search-results');
    if (!query.trim()) { container.innerHTML = '<div class="empty-state">输入关键词，搜索任务、重点、随笔和周总结。</div>'; return; }
    container.innerHTML = '<div class="empty-state">正在搜索…</div>';
    try {
      const { results } = await request(`/api/search?q=${encodeURIComponent(query.trim())}`);
      container.innerHTML = results.length ? results.map((result, position) => `<button class="search-result" data-result="${position}"><small>${escape(result.date || result.startDate)} · ${escape(result.type)}</small>${escape(result.text)}</button>`).join('') : '<div class="empty-state">没有找到相关记录。</div>';
      container.querySelectorAll('[data-result]').forEach(button => button.addEventListener('click', () => {
        const result = results[Number(button.dataset.result)]; $('#modal').close(); jump(result.startDate, result.date);
      }));
    } catch (error) { container.innerHTML = `<div class="empty-state">搜索失败：${escape(error.message)}</div>`; }
  }

  function openSearch() {
    $('#modal-content').innerHTML = '<div class="modal-head"><h2>搜索所有记录</h2><button class="close-modal" aria-label="关闭">×</button></div><input class="search-input" id="search-input" type="search" placeholder="输入关键词…" autocomplete="off"><div class="search-results"><div class="empty-state">输入关键词，搜索任务、重点、随笔和周总结。</div></div>';
    $('#modal').showModal(); $('#search-input').focus();
    $('#search-input').addEventListener('input', event => { clearTimeout(searchTimer); searchTimer = setTimeout(() => performSearch(event.target.value), 220); });
  }
  $('#search-open').addEventListener('click', openSearch);
  document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); } });

  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded', 'false'); }
  $('#menu-toggle').addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-collapsed')) { document.body.classList.remove('sidebar-collapsed'); localStorage.removeItem('weekly.sidebarCollapsed'); return; }
    const open = $('#sidebar').classList.toggle('open'); $('#menu-toggle').setAttribute('aria-expanded', String(open));
  });
  $('#sidebar-collapse').addEventListener('click', () => { document.body.classList.add('sidebar-collapsed'); localStorage.setItem('weekly.sidebarCollapsed', '1'); closeSidebar(); });
  if (localStorage.getItem('weekly.sidebarCollapsed') === '1') document.body.classList.add('sidebar-collapsed');
  const goCurrent = () => jump(index.some(meta => meta.startDate === thisWeek) ? thisWeek : index[0]?.startDate);
  $('#go-today').addEventListener('click', goCurrent);
  $('.brand').addEventListener('click', event => { event.preventDefault(); goCurrent(); });

  async function start() {
    try {
      const result = await request('/api/index'); index = result.weeks;
      const ids = index.slice(0, INITIAL_LOAD).map(meta => meta.startDate); await loadIds(ids);
      ids.forEach((id, position) => { shown.add(id); if (position < DEFAULT_EXPANDED) opened.add(id); });
      activeId = index.some(meta => meta.startDate === thisWeek) ? thisWeek : index[0]?.startDate || '';
      setSaveStatus('saved', '已保存到本地 JSON'); render();
    } catch (error) {
      $('#weeks').innerHTML = `<div class="empty-state error-state">无法读取本地记录：${escape(error.message)}<br>请确认本地服务仍在运行，然后刷新页面。</div>`;
      $('#load-more').hidden = true; setSaveStatus('error', '读取失败');
    }
  }
  start();
}
