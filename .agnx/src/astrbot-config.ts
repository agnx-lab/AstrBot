// 场景：AstrBot port / dataDir / runtimeMode / retain 经 host.config 落盘；面板 ensure 与详情共用。
import type { WorkspaceAppConfigApi } from "@agnx-lab/app-sdk";
import {
  ASTRBOT_APP_ID,
  ASTRBOT_CONFIG_KEY,
  DEFAULT_ASTRBOT_PORT,
  type AstrBotRuntimeMode,
} from "./constants";

export interface AstrBotAppConfigDocument {
  version: 1;
  port: number;
  dataDir: string;
  runtimeMode: AstrBotRuntimeMode;
  /** uv 可执行覆盖；空 = PATH / 常见路径探测 */
  uvPath: string;
  bindLoopbackOnly: boolean;
  /** 关 Tab 后是否继续 requestRetain（IM 长连默认 true） */
  keepRunningInBackground: boolean;
}

export function defaultAstrBotDataDir(): string {
  // 运行时由 ensure 再解析 AGNX_HOME；此处仅作详情占位提示
  return "";
}

export function defaultAstrBotAppConfigDocument(): AstrBotAppConfigDocument {
  return {
    version: 1,
    port: DEFAULT_ASTRBOT_PORT,
    dataDir: "",
    runtimeMode: "uv",
    uvPath: "",
    bindLoopbackOnly: true,
    keepRunningInBackground: true,
  };
}

function normalizeRuntimeMode(raw: unknown): AstrBotRuntimeMode {
  return raw === "docker" ? "docker" : "uv";
}

function normalizePort(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) {
    return DEFAULT_ASTRBOT_PORT;
  }
  return Math.floor(n);
}

export function normalizeAstrBotAppConfigDocument(raw: unknown): AstrBotAppConfigDocument {
  const defaults = defaultAstrBotAppConfigDocument();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }
  const doc = raw as Partial<AstrBotAppConfigDocument>;
  return {
    version: 1,
    port: normalizePort(doc.port),
    dataDir: typeof doc.dataDir === "string" ? doc.dataDir.trim() : "",
    runtimeMode: normalizeRuntimeMode(doc.runtimeMode),
    uvPath: typeof doc.uvPath === "string" ? doc.uvPath.trim() : "",
    bindLoopbackOnly: doc.bindLoopbackOnly !== false,
    keepRunningInBackground: doc.keepRunningInBackground !== false,
  };
}

export async function loadAstrBotConfigFromHost(
  config: WorkspaceAppConfigApi | null | undefined,
): Promise<AstrBotAppConfigDocument> {
  if (!config?.get) {
    return defaultAstrBotAppConfigDocument();
  }
  try {
    const raw = await config.get({
      scope: "app",
      appId: ASTRBOT_APP_ID,
      key: ASTRBOT_CONFIG_KEY,
      defaultValue: null,
    });
    return normalizeAstrBotAppConfigDocument(raw);
  } catch {
    return defaultAstrBotAppConfigDocument();
  }
}

export async function saveAstrBotConfigToHost(
  config: WorkspaceAppConfigApi | null | undefined,
  patch: Partial<
    Pick<
      AstrBotAppConfigDocument,
      | "port"
      | "dataDir"
      | "runtimeMode"
      | "uvPath"
      | "bindLoopbackOnly"
      | "keepRunningInBackground"
    >
  >,
): Promise<AstrBotAppConfigDocument> {
  const current = await loadAstrBotConfigFromHost(config);
  const normalized = normalizeAstrBotAppConfigDocument({ ...current, ...patch });
  if (!config?.set) {
    return normalized;
  }
  await config.set({
    scope: "app",
    appId: ASTRBOT_APP_ID,
    key: ASTRBOT_CONFIG_KEY,
    value: normalized,
  });
  return normalized;
}

/** 把 host.config 转成 ensure CLI 参数。 */
export function astrBotConfigToEnsureArgs(
  cfg: AstrBotAppConfigDocument,
  options?: { forceRestart?: boolean },
): string[] {
  const args = [
    "--port",
    String(cfg.port),
    "--runtime-mode",
    cfg.runtimeMode,
    "--bind-loopback-only",
    cfg.bindLoopbackOnly ? "true" : "false",
  ];
  if (cfg.dataDir) {
    args.push("--data-dir", cfg.dataDir);
  }
  if (cfg.uvPath) {
    args.push("--uv-path", cfg.uvPath);
  }
  if (options?.forceRestart) {
    args.push("--force-restart");
  }
  return args;
}
