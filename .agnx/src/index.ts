// 场景：AstrBot Sub App 入口 — 薄壳 + host.guest.mount + 详情配置 + 极薄 tools。
import type { WorkspaceAppHostApi, WorkspaceAppModule } from "@agnx-lab/app-sdk";
import { AstrBotIcon } from "./astrbot-icon";
import {
  ASTRBOT_APP_ID,
  ASTRBOT_ENSURE_TOOL_REL,
  ASTRBOT_OPEN_COMMAND_ID,
  ASTRBOT_PANEL_ID,
} from "./constants";
import { registerAstrBotAgentTools } from "./agent-tools";
import { registerAstrBotDetailConfig } from "./detail-config";
import { bindAstrBotHarnessHost, AstrBotPanel } from "./panel";

export const appId = ASTRBOT_APP_ID;

function openAstrBotTab(
  host: WorkspaceAppHostApi,
  context?: {
    serverId?: string;
    workspaceId?: string;
    currentPathname?: string | null;
  },
): void {
  host.openMiniAppTab({
    appId: ASTRBOT_APP_ID,
    panelId: ASTRBOT_PANEL_ID,
    serverId: context?.serverId,
    workspaceId: context?.workspaceId,
    currentPathname: context?.currentPathname,
  });
}

export function activate(host: WorkspaceAppHostApi): void {
  bindAstrBotHarnessHost(host);
  registerAstrBotDetailConfig(host);
  registerAstrBotAgentTools(host);

  host.registerMiniApp({
    id: ASTRBOT_PANEL_ID,
    appId: ASTRBOT_APP_ID,
    title: "AstrBot",
    icon: AstrBotIcon,
    component: AstrBotPanel,
    iframeShortcutCapture: true,
    isolation: {
      mode: "iframe",
      sidecarTools: [ASTRBOT_ENSURE_TOOL_REL],
      note: "host.guest.mount（auth:none → direct-iframe）；ensure-astrbot supervised uv/docker",
    },
  });

  host.registerCommand({
    id: ASTRBOT_OPEN_COMMAND_ID,
    appId: ASTRBOT_APP_ID,
    title: "AstrBot",
    keywords: ["astrbot", "qq", "飞书", "telegram", "discord", "im bot", "机器人"],
    icon: AstrBotIcon,
    sidebarAction: {
      defaultVisible: true,
      label: "AstrBot",
      order: 61,
    },
    run: (context) => {
      openAstrBotTab(host, context);
    },
  });
}

const moduleExport: WorkspaceAppModule = {
  appId: ASTRBOT_APP_ID,
  activate,
};

export default moduleExport;

export {
  ASTRBOT_APP_ID,
  ASTRBOT_OPEN_COMMAND_ID,
  ASTRBOT_PANEL_ID,
} from "./constants";
export { AstrBotPanel } from "./panel";
