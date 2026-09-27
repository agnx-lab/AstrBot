# AstrBot · Agnx 嵌入说明

- **上游：** [AstrBotDevs/AstrBot](https://github.com/AstrBotDevs/AstrBot)（**AGPL-3.0-or-later**）
- **嵌入模式：** Wrap 整仓 + Sidecar（默认 `uv run main.py`；高级 `runtimeMode=docker`）+ Guest（`guest.auth=none` → `direct-iframe`）
- **默认 Dashboard：** `http://127.0.0.1:6185`（`DASHBOARD_HOST=127.0.0.1` loopback only）
- **数据根：** `$AGNX_HOME/apps/data/astrbot`（经 `ASTRBOT_ROOT` 注入；实际数据在 `…/data/`）
- **runtimeMode：** 默认 `uv`；详情可切 `docker`（compose 映射 6185 + volume→dataDir）
- **鉴权：** 一期不在 Host 存密码；用户在上游 WebUI 登录一次（JWT cookie 留在 Guest 分区）
- **AGPL：** 本树对外分发修改版时须保留本文件与源码获取方式；胶水仅 IPC/HTTP，不静态链进 Agnx 闭源核
- **活页：** Agnx monorepo `docs/sub-app/AstrBot子应用需求_astrbot-sub-app.md`

## Agnx 侧改动（相对上游）

| 路径 | 说明 |
| --- | --- |
| `.agnx/` | Agnx 胶水（manifest / ensure / panel / host.config / tools） |
| `EMBED.md` / `README.agnx.md` | 本嵌入说明 |
| （可选）上游 framing 补丁 | 仅当 Dashboard 响应头阻挡跨源 iframe 时，经 `AGNX_ALLOW_IFRAME=1` 门控放宽；见 ensure 注释 |
| ensure faiss 降级 | 真树 `pyproject.toml` 增 `[tool.uv] override-dependencies = ["faiss-cpu==1.12.0"]`（旧 macOS 无 ≥1.14 wheel） |

默认 ensure 注入 `AGNX_ALLOW_IFRAME=1`。若上游主 Dashboard **未**设置 `X-Frame-Options`/`frame-ancestors` 限制，则无需改 Python 源。

**faiss 降级说明：** 不修改上游 `pyproject.toml` 声明；仅 ensure 在探测到平台不兼容时临时 override。知识库向量功能可能与上游最新 faiss 行为略有差异；生产 ARM/新 macOS / Linux / Docker 走默认解析。
