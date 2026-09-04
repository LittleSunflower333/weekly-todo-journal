'use strict';

const path = require('node:path');
const { createStore } = require('../server');

async function main() {
  const store = createStore(path.join(__dirname, '..', 'data'));
  const index = await store.readIndex();
  await Promise.all(index.weeks.map(item => store.readWeek(item.startDate)));
  console.log(`数据检查通过：${index.weeks.length} 周`);
}

main().catch(error => {
  console.error(`数据检查失败：${error.message}`);
  process.exitCode = 1;
});
