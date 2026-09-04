'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStore, makeWeek } = require('../server');

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weekly-todo-'));
  const dataDir = path.join(root, 'data');
  const weeksDir = path.join(dataDir, 'weeks');
  await fs.mkdir(weeksDir, { recursive: true });
  const week = makeWeek('2026-08-31');
  await fs.writeFile(path.join(dataDir, 'index.json'), JSON.stringify({ weeks: [{ startDate: week.startDate, endDate: week.endDate }] }));
  await fs.writeFile(path.join(weeksDir, `${week.startDate}.json`), JSON.stringify(week));
  return { root, dataDir, store: createStore(dataDir), week };
}

test('新增下一周并保持索引倒序', async t => {
  const { root, store } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const created = await store.createWeek();
  assert.equal(created.startDate, '2026-09-07');
  assert.deepEqual((await store.readIndex()).weeks.map(item => item.startDate), ['2026-09-07', '2026-08-31']);
  assert.equal((await store.readWeek('2026-09-07')).days.length, 7);
});

test('保存、刷新读取与搜索使用同一份周文件', async t => {
  const { root, store, week } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  week.focus.push('准备字节二面');
  week.days[4].tasks.push({ id: 'task_unique', text: '整理面试问题', done: true });
  week.days[4].note = '今天重新看了一遍字节面试复盘';
  week.summary.highlight = '完成了准备工作';
  await store.saveWeek(week.startDate, week);
  assert.equal((await store.readWeek(week.startDate)).days[4].tasks[0].done, true);
  const results = await store.search('字节');
  assert.equal(results.length, 2);
  assert.ok(results.every(item => item.startDate === week.startDate));
});

test('拒绝损坏结构和重复 Todo ID', async t => {
  const { root, store, week } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  week.days[0].tasks = [
    { id: 'same', text: 'A', done: false },
    { id: 'same', text: 'B', done: false }
  ];
  await assert.rejects(() => store.saveWeek(week.startDate, week), /Todo ID 重复/);
});

test('删除周时同时移除索引与数据文件', async t => {
  const { root, dataDir, store } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.deleteWeek('2026-08-31');
  assert.deepEqual((await store.readIndex()).weeks, []);
  await assert.rejects(() => fs.access(path.join(dataDir, 'weeks', '2026-08-31.json')));
});
