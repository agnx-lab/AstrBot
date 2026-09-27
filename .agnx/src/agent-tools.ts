// 场景：W4 — 极薄 Agnx Agent 工具：astrbot_health / astrbot_open；不镜像插件市场。
import type { WorkspaceAppHostApi } from "@getagnx/app-sdk";
import {
  ASTRBOT_APP_ID,
  ASTRBOT_ENSURE_TOOL_REL,
  ASTRBOT_PANEL_ID,
} from "./constants";
import { astrBotConfigToEnsureArgs, loadAstrBotConfigFromHost } from "./astrbot-config";

const GROUP = {
  groupId: "astrbot",
  groupTitle: "AstrBot",
} as const;

function pickEnsurePayload(result: {
  resultJson?: unknown;
  stdout?: string;
}): Record<string, unknown> | null {
  const json = result.resultJson;
  if (json && typeof json === "object" && json !== null) {
    return json as Record<string, unknown>;
  }
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  for (const line of stdout.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  return null;
}

export function registerAstrBotAgentTools(host: WorkspaceAppHostApi): () => void {
  return host.registerAgentTools({
    appId: ASTRBOT_APP_ID,
    availability: "always",
    tools: [
      {
        name: "astrbot_health",
        ...GROUP,
        description:
          "检查 AstrBot Dashboard 是否就绪（必要时短跑 ensure）。返回 origin/port；不代替 AstrBot 内插件/IM 操作。",
        inputSchema: {
          type: "object",
          properties: {
            ensure: {
              type: "boolean",
              description: "为 true 时主动跑 ensure（默认 true）",
            },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const ensure = input?.ensure !== false;
          if (!ensure) {
            return {
              ok: true,
              message: "未执行 ensure；请打开 AstrBot Tab 或设 ensure:true。",
            };
          }
          if (!host.tools?.run) {
            return {
              ok: false,
              error: "host_tools_unavailable",
              message: "需 Agnx 桌面端 host.tools.run。",
            };
          }
          const cfg = await loadAstrBotConfigFromHost(host.config);
          const result = await host.tools.run({
            appId: ASTRBOT_APP_ID,
            tool: ASTRBOT_ENSURE_TOOL_REL,
            args: astrBotConfigToEnsureArgs(cfg),
            timeoutMs: 300_000,
          });
          const payload = pickEnsurePayload(result);
          if (payload) {
            return payload;
          }
          return {
            ok: false,
            error: "empty_ensure_result",
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            stderr: result.stderr?.slice(0, 400),
          };
        },
      },
      {
        name: "astrbot_open",
        ...GROUP,
        description:
          "在工作区打开 AstrBot Tab（上游 WebUI / ChatUI）。IM / 插件 / LLM Key 请在上游界面操作。",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => {
          host.openMiniAppTab({
            appId: ASTRBOT_APP_ID,
            panelId: ASTRBOT_PANEL_ID,
          });
          return {
            ok: true,
            appId: ASTRBOT_APP_ID,
            panelId: ASTRBOT_PANEL_ID,
            message: "已请求打开 AstrBot Tab。",
          };
        },
      },
    ],
  });
}
