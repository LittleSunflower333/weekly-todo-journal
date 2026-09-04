'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function parseDate(value) {
  if (!DATE_RE.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : date;
}
function dateKey(date) { return date.toISOString().slice(0, 10); }
function shiftDate(value, days) { const date = parseDate(value); date.setUTCDate(date.getUTCDate() + days); return dateKey(date); }
function mondayOf(date = new Date()) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  return dateKey(value);
}
function makeWeek(startDate) {
  return {
    startDate,
    endDate: shiftDate(startDate, 6),
    focus: [],
    days: Array.from({ length: 7 }, (_, index) => ({ date: shiftDate(startDate, index), tasks: [], note: '' })),
    summary: { highlight: '', blocked: '', nextWeek: '' }
  };
}

function validateWeek(week, expectedStart) {
  const fail = message => { const error = new Error(message); error.status = 400; throw error; };
  if (!week || typeof week !== 'object' || Array.isArray(week)) fail('周数据必须是 JSON 对象');
  if (!parseDate(week.startDate) || week.startDate !== expectedStart) fail('startDate 与目标周不一致');
  if (week.endDate !== shiftDate(week.startDate, 6)) fail('endDate 必须是 startDate 后第 6 天');
  if (!Array.isArray(week.focus) || !week.focus.every(item => typeof item === 'string')) fail('focus 必须是字符串数组');
  if (!Array.isArray(week.days) || week.days.length !== 7) fail('days 必须包含周一至周日 7 天');
  const ids = new Set();
  week.days.forEach((day, index) => {
    if (!day || day.date !== shiftDate(week.startDate, index)) fail(`第 ${index + 1} 天的日期不正确`);
    if (typeof day.note !== 'string' || !Array.isArray(day.tasks)) fail(`第 ${index + 1} 天的内容格式不正确`);
    day.tasks.forEach(task => {
      if (!task || typeof task.id !== 'string' || !task.id.trim() || typeof task.text !== 'string' || typeof task.done !== 'boolean') fail('Todo 缺少有效的 id、text 或 done');
      if (ids.has(task.id)) fail(`Todo ID 重复：${task.id}`);
      ids.add(task.id);
    });
  });
  if (!week.summary || ['highlight', 'blocked', 'nextWeek'].some(key => typeof week.summary[key] !== 'string')) fail('summary 必须包含 highlight、blocked 和 nextWeek');
  return week;
}

function createStore(dataDir) {
  const indexPath = path.join(dataDir, 'index.json');
  const weeksDir = path.join(dataDir, 'weeks');
  const weekPath = startDate => path.join(weeksDir, `${startDate}.json`);

  async function atomicWrite(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await fs.rename(temporary, file);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  }

  async function readJson(file, label) {
    let text;
    try { text = await fs.readFile(file, 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') { const missing = new Error(`${label}不存在`); missing.status = 404; throw missing; }
      throw error;
    }
    try { return JSON.parse(text); }
    catch { const invalid = new Error(`${label}不是有效的 JSON`); invalid.status = 500; throw invalid; }
  }

  async function readIndex() {
    const data = await readJson(indexPath, 'data/index.json');
    if (!data || !Array.isArray(data.weeks)) { const error = new Error('data/index.json 缺少 weeks 数组'); error.status = 500; throw error; }
    const seen = new Set();
    for (const item of data.weeks) {
      if (!item || !parseDate(item.startDate) || item.endDate !== shiftDate(item.startDate, 6) || seen.has(item.startDate)) {
        const error = new Error('data/index.json 包含无效或重复的周索引'); error.status = 500; throw error;
      }
      seen.add(item.startDate);
    }
    return { weeks: [...data.weeks].sort((a, b) => b.startDate.localeCompare(a.startDate)) };
  }

  async function readWeek(startDate) {
    if (!parseDate(startDate)) { const error = new Error('日期格式必须是 YYYY-MM-DD'); error.status = 400; throw error; }
    const week = await readJson(weekPath(startDate), `周数据 ${startDate}`);
    return validateWeek(week, startDate);
  }

  async function saveWeek(startDate, week) {
    const index = await readIndex();
    if (!index.weeks.some(item => item.startDate === startDate)) { const error = new Error('目标周不存在'); error.status = 404; throw error; }
    validateWeek(week, startDate);
    await atomicWrite(weekPath(startDate), week);
    return week;
  }

  async function createWeek() {
    const index = await readIndex();
    const startDate = index.weeks.length ? shiftDate(index.weeks[0].startDate, 7) : mondayOf();
    if (index.weeks.some(item => item.startDate === startDate)) { const error = new Error('这一周已经存在'); error.status = 409; throw error; }
    const week = makeWeek(startDate);
    await atomicWrite(weekPath(startDate), week);
    try {
      const nextIndex = { weeks: [{ startDate, endDate: week.endDate }, ...index.weeks].sort((a, b) => b.startDate.localeCompare(a.startDate)) };
      await atomicWrite(indexPath, nextIndex);
    } catch (error) {
      await fs.rm(weekPath(startDate), { force: true }).catch(() => {});
      throw error;
    }
    return week;
  }

  async function deleteWeek(startDate) {
    const index = await readIndex();
    if (!index.weeks.some(item => item.startDate === startDate)) { const error = new Error('目标周不存在'); error.status = 404; throw error; }
    await readWeek(startDate);
    const original = weekPath(startDate);
    const backup = path.join(weeksDir, `.${startDate}.${crypto.randomUUID()}.deleting`);
    await fs.rename(original, backup);
    try {
      await atomicWrite(indexPath, { weeks: index.weeks.filter(item => item.startDate !== startDate) });
      await fs.rm(backup, { force: true });
    } catch (error) {
      await fs.rename(backup, original).catch(() => {});
      throw error;
    }
  }

  async function search(query) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    const index = await readIndex();
    const results = [];
    const add = (week, type, text, date) => {
      if (text.toLocaleLowerCase().includes(needle)) results.push({ startDate: week.startDate, date, type, text });
    };
    for (const meta of index.weeks) {
      const week = await readWeek(meta.startDate);
      week.focus.forEach(text => add(week, '本周重点', text));
      week.days.forEach(day => {
        day.tasks.forEach(task => add(week, 'Todo', task.text, day.date));
        add(week, '随笔', day.note, day.date);
      });
      add(week, '周总结 · 亮点', week.summary.highlight);
      add(week, '周总结 · 卡住', week.summary.blocked);
      add(week, '周总结 · 下周', week.summary.nextWeek);
    }
    return results.slice(0, 100);
  }

  return { atomicWrite, readIndex, readWeek, saveWeek, createWeek, deleteWeek, search };
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1024 * 1024) { const error = new Error('请求内容过大'); error.status = 413; throw error; }
  }
  try { return body ? JSON.parse(body) : {}; }
  catch { const error = new Error('请求内容不是有效的 JSON'); error.status = 400; throw error; }
}

function createApp({ dataDir = path.join(__dirname, 'data'), publicDir = __dirname } = {}) {
  const store = createStore(dataDir);
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const sendJson = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.method === 'GET' && url.pathname === '/api/index') return sendJson(200, await store.readIndex());
      if (request.method === 'GET' && url.pathname === '/api/search') return sendJson(200, { results: await store.search(url.searchParams.get('q') || '') });
      if (request.method === 'POST' && url.pathname === '/api/weeks') { await readBody(request); return sendJson(201, await store.createWeek()); }
      const match = url.pathname.match(/^\/api\/weeks\/(\d{4}-\d{2}-\d{2})$/);
      if (match && request.method === 'GET') return sendJson(200, await store.readWeek(match[1]));
      if (match && request.method === 'PUT') return sendJson(200, await store.saveWeek(match[1], await readBody(request)));
      if (match && request.method === 'DELETE') { await store.deleteWeek(match[1]); return sendJson(200, { ok: true }); }
      if (url.pathname.startsWith('/api/')) return sendJson(404, { error: '接口不存在' });

      const staticName = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!['index.html', 'styles.css', 'app.js', 'favicon.svg'].includes(staticName)) { response.writeHead(404); return response.end('Not found'); }
      const file = path.join(publicDir, staticName);
      const content = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(content);
    } catch (error) {
      console.error(error);
      sendJson(error.status || 500, { error: error.status ? error.message : '本地数据操作失败，请检查终端和数据文件' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 4173;
  const server = createApp();
  server.listen(port, '127.0.0.1', () => console.log(`Weekly Todo 已启动：http://localhost:${port}`));
}

module.exports = { createApp, createStore, makeWeek, validateWeek, shiftDate, mondayOf, DAY_MS };
