'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const dataDir = path.join(__dirname, '..', 'data');
  await fs.mkdir(path.join(dataDir, 'weeks'), { recursive: true });
  try {
    await fs.writeFile(path.join(dataDir, 'index.json'), '{\n  "weeks": []\n}\n', { flag: 'wx' });
    console.log('已初始化空白数据目录，启动后可创建本周。');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log('数据目录已存在，保留所有记录。');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
