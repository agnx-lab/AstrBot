// 场景：AstrBot Sub App 常量（AppId / 命令 / 面板 / ensure / 配置键）。
export const ASTRBOT_APP_ID = "astrbot";
export const ASTRBOT_PANEL_ID = "astrbot.main";
export const ASTRBOT_OPEN_COMMAND_ID = "astrbot.open";

/** 短跑 sidecar：复用或拉起 AstrBot Dashboard（默认 uv）。 */
export const ASTRBOT_ENSURE_TOOL_REL = ".agnx/tools/ensure-astrbot.mjs";

/** host.config app 级配置文档。 */
export const ASTRBOT_CONFIG_KEY = "astrbot-app-config-v1";

export const DEFAULT_ASTRBOT_PORT = 6185;

export type AstrBotRuntimeMode = "uv" | "docker";
