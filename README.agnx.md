# Agnx Sub App · AstrBot

官方 [AstrBot](https://github.com/AstrBotDevs/AstrBot)（AGPL-3.0）的 Agnx 外置子应用薄壳。

## 许可证

上游 **AGPL-3.0-or-later**。修改后的 AstrBot 树若对外分发，须履行 AGPL 义务（提供对应源码）。Agnx 宿主仅通过 loopback HTTP Guest 嵌入，不把上游代码静态链接进闭源发行二进制。详见 [`EMBED.md`](./EMBED.md)。

## 构建胶水

```bash
cd .agnx && npm run build
# 或：node .agnx/scripts/build.mjs
```

## 首次依赖（uv）

```bash
# 需本机 uv；ensure 会钉 Python 3.12
uv sync --python 3.12
```

## Tab 行为

打开 Tab → `ensure-astrbot.mjs --supervised` → daemon spawn `uv run --python 3.12 main.py` → Guest iframe `http://127.0.0.1:6185`。

登录账号默认 `astrbot`；密码在上游 WebUI 首次配置（Host 不存明文）。

Docker 仅在详情 `runtimeMode=docker` 时启用。

活页：Agnx monorepo `docs/sub-app/AstrBot子应用需求_astrbot-sub-app.md`
