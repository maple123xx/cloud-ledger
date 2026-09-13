# 我的记账本 · Cloud Ledger

多用户云端账户管理：收入、支出、余额。

一个中文记账网页，支持 ChatGPT 登录、云端保存及同一账号跨浏览器同步。页面公开访问，账目按登录用户隔离。

[打开在线记账本](https://my-ledger-79327-sep12.icy-thyme-8349.chatgpt.site/)

## 功能

- 添加收入、支出和备注，查看余额与收支明细；支持负余额。
- 金额以整数“分”存储，余额在前端使用 BigInt 汇总；输入最多两位小数。
- 单笔金额为 0.01～999999999.99 元，备注最多 200 字符。
- 使用同一个 ChatGPT 账号，在不同浏览器查看同一份云端账目。
- 页面可见时每 15 秒轮询同步，切回窗口也会刷新；支持手动刷新。不是 WebSocket 实时推送。
- 可导入当前浏览器旧版 localStorage 中的记录；原本地数据保留。同一份旧记录重复导入会去重。
- 保存失败时保留输入，同一次未改动输入的重试使用相同记录编号，避免重复写入。

## 使用方法

1. 打开在线地址，点击“使用 ChatGPT 登录”。
2. 选择收入或支出，填写金额与可选备注，点击“添加记录”。
3. 在其他浏览器登录同一个账号，等待自动同步或点击“刷新云端账目”。
4. 若当前浏览器存在旧账目，可点击“导入此浏览器的旧账目”。导入前核对当前登录账号。

旧账目导入只读取当前网址、当前浏览器的 `my-ledger-records-v1` 存储项。其他浏览器或原本 `file://` 本地网页中的数据不会自动迁移。

## 技术架构

| 层级 | 实现 |
| --- | --- |
| 前端 | HTML、CSS、原生 JavaScript |
| 后端 | JavaScript ES Modules / Cloudflare Workers |
| 数据库 | Cloudflare D1（SQLite） |
| 表结构及迁移 | Drizzle ORM / Drizzle Kit |
| 身份验证 | Sites 平台提供的 ChatGPT 登录 |
| 托管 | Sites |

浏览器调用 `/api/*`，Worker 从平台身份头识别用户，再使用参数化 SQL 访问 D1。身份授权在服务端执行，客户端不提交用户归属。

## 项目结构

```text
.
├── index.html                 # 页面结构和样式
├── client.js                  # 输入、API 请求、同步和旧账目导入
├── worker.mjs                 # Worker 路由、鉴权和数据库操作
├── db/schema.ts               # 数据库表结构
├── drizzle/                   # SQL 迁移、快照与迁移日志
├── drizzle.config.ts          # 迁移生成配置
├── scripts/
│   ├── build.mjs              # 合并前端并生成 Worker 部署产物
│   └── test.mjs               # 使用内存 SQLite 验证接口逻辑
├── .openai/hosting.json        # Sites 项目标识和 DB 逻辑绑定
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

## 本地构建与测试

已验证环境为 Node.js 24.19.0 和 pnpm 11.19.0。测试使用 Node.js 的 `node:sqlite` 模块。先安装 Node.js 与 pnpm，再在项目根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm run build
node scripts/test.mjs
```

构建会把页面和前端脚本嵌入 `dist/server/index.js`，并复制部署配置及迁移到 `dist/.openai/`。`dist/` 与 `node_modules/` 不纳入版本管理。

测试覆盖：未登录拒绝访问、用户数据隔离、写入后读取、重复提交去重、金额校验、跨来源写入拒绝及页面打包。测试使用模拟身份与内存数据库，不会修改线上账目，也不代替真实浏览器登录与生产环境验证。

当前未提供 `dev` 启动脚本或完整本地登录环境。直接双击 `index.html` 或用普通静态服务器打开，只能展示页面，不能使用云端 API。

修改 `db/schema.ts` 后生成新迁移：

```sh
pnpm run db:generate
pnpm run build
node scripts/test.mjs
```

检查生成的 SQL 后再部署；不要修改已经应用到生产环境的迁移文件及对应元数据。

## API

以下接口均要求平台认证身份，返回 JSON，响应不缓存。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/me` | 返回当前账号邮箱 |
| GET | `/api/records` | 返回当前用户账目 |
| POST | `/api/records` | 批量新增记录，每次 1～100 条 |

新增请求示例：

```json
{
  "records": [
    {"id": "unique-record-id", "type": "expense", "cents": 2550, "note": "午餐"}
  ]
}
```

写入需要同源 `Origin`、`Content-Type: application/json` 和 `X-Ledger-Request: 1`。请求体最多 120000 字节。记录主键为 `(owner, id)`，同一用户相同编号的请求重试不会再次新增。

## 数据库

`ledger_records` 表包含：

| 字段 | 含义 |
| --- | --- |
| owner | 平台认证用户标识 |
| id | 记录编号 |
| type | `income` 或 `expense` |
| cents | 整数分 |
| note | 备注 |
| created_at | 服务端写入时间，毫秒时间戳 |

查询按 `owner` 筛选，并按写入时间与编号排序。数据库结构保存在仓库中，实际用户账目保存在云端 D1，不随源码上传到 GitHub。

## 部署与登录依赖

本项目当前针对 Sites 的 Cloudflare Workers 运行环境：

- `.openai/hosting.json` 中的 `project_id` 对应现有网站，`d1` 为 `DB`，`r2` 未启用。
- 平台将 D1 数据库注入为 `env.DB`，在发布时应用迁移。
- `/signin-with-chatgpt`、`/signout-with-chatgpt` 及登录回调由平台处理，项目本身不实现这些路由。
- Worker 信任平台注入的 `oai-authenticated-user-id` 和 `oai-authenticated-user-email`。迁移到其他平台时必须重新实现可信的身份验证，不能直接信任访客自填的同名请求头。
- 复制项目到其他站点时需要配置属于新站点的项目标识、数据库和身份验证。仓库不包含可直接用于任意平台的一键部署流程。

GitHub 用于保存源码；当前没有配置 GitHub Actions 自动部署，提交到 GitHub不会自动更新线上网页。发布应通过现有 Sites 发布流程完成。

## 当前限制

- 暂不支持修改或删除账目、分类统计、导出和离线记账。
- 同步依赖网络和页面可见状态，后台标签页可能延迟。
- 列表一次读取当前账号的全部记录，暂未分页，适合轻量使用。
- 旧账目去重依据记录内容和在旧列表中的位置；来源列表被编辑或重排后，不保证跨版本去重。
- 没有共享账本：不同账号各自保存，只有同一账号跨浏览器同步。

## 学习建议

按 `index.html` → `client.js` → `worker.mjs` → `db/schema.ts` 的顺序阅读，可以了解从页面输入、接口请求到数据库保存的完整流程。
