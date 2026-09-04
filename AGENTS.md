# 项目维护说明

## 用途

这是本地优先的个人 Weekly Todo + Journal。保持功能简单、数据可读，不扩展为项目管理系统。

## 用户数据

`data/index.json` 和 `data/weeks/*.json` 都属于用户数据。不要批量覆盖、清空、生成虚构内容或删除历史周。改动前先读取现有文件，并保留用户已经写入的内容。

`data/index.json` 只保存 `{ startDate, endDate }` 周索引，按 `startDate` 倒序排列。一周正文位于 `data/weeks/<startDate>.json`：

- `focus`：本周重点字符串数组。
- `days`：从周一到周日的 7 项数组。
- `days[].tasks`：Todo 数组；每项包含唯一字符串 `id`、字符串 `text` 和布尔值 `done`。
- `days[].note`：当天随笔纯文本。
- `summary.highlight`、`summary.blocked`、`summary.nextWeek`：周总结纯文本。

## 日常修改规则

用户要求新增、完成或删除 Todo、写随笔、改重点或周总结时，优先只修改对应周 JSON，不修改 UI 代码。

- 新增 Todo：在当天 `tasks` 中追加对象，使用 UUID 或其他不会重复的稳定 ID。
- 完成 Todo：找到对应 ID，把 `done` 改为 `true`；取消完成则改为 `false`。
- 随笔：修改目标日期的 `note`，保留普通文本和换行。
- 周总结：只修改 `summary` 下对应字段。
- 新增周：以周一为 `startDate`，周日为 `endDate`，建立完整 7 天结构，同时更新索引；不得创建重复周。

不要使用数组下标作为 Todo ID。不要改变既有周的日期范围。不要在没有明确要求时迁移未完成任务、重排或改写历史内容。

## 运行与检查

项目使用 Node.js 内置模块，无第三方依赖：

```bash
npm start
npm run check
npm test
```

服务默认位于 <http://localhost:4173>。修改数据后先确认 JSON 可解析、日期连续、Todo ID 唯一，再运行测试。网页刷新会读取最新磁盘数据。
