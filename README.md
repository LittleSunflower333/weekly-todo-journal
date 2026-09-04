# 一周 · Weekly

一个本地优先、按周组织的个人 Todo + 周记工具。页面负责快速查看和编辑，`data/` 下的 JSON 文件是唯一真实数据源。

## 启动

需要 Node.js 18 或更高版本。不依赖第三方包，无需安装依赖。

```bash
npm run setup
npm start
```

然后打开 <http://localhost:4173>。停止服务可在终端按 `Control-C`。

## 数据位置

- `data/index.json`：轻量周索引，按日期倒序排列。
- `data/weeks/YYYY-MM-DD.json`：一周一个文件，文件名和 `startDate` 都使用该周周一的日期。

网页中的勾选、新增、删除与文字编辑都会写回这些文件。本周重点、每日随笔和周总结停止输入约 650ms 后自动保存；任务勾选和增删立即保存。浏览器刷新后会重新读取磁盘内容，因此也能看到 Codex 或手工修改后的结果。

## 备份与恢复

代码仓库通过 `.gitignore` 排除了个人 `data/` 目录，推送代码不会备份周记。首次克隆后运行 `npm run setup` 初始化空白数据；再次运行不会覆盖已有记录。

备份时单独复制整个 `data/` 目录。恢复时先停止服务，用备份恢复 `data/`，再重新启动。手工编辑后应保证 JSON 语法正确、索引与周文件对应；运行 `npm run check` 可检查当前数据。

## 创建新周

网页右上角的 `＋` 会基于当前最新周创建下一周，并写入索引。也可以手工复制一个周文件，修改日期后把对应的 `startDate` 和 `endDate` 加入 `data/index.json`；索引必须保持倒序且不能重复。

## 用 Codex 维护

让 Codex 修改日常数据时，应直接编辑对应的 `data/weeks/YYYY-MM-DD.json`。例如勾选任务时修改该任务的 `done`，记录随笔时修改当天的 `note`，写周总结时修改 `summary`。不要为日常内容更新改动页面代码。

## 检查

```bash
npm run check
npm test
```

`npm run check` 校验当前 `data/` 中的索引和全部周文件。测试覆盖新建周、保存与重新读取、搜索、数据校验及删除一致性。
