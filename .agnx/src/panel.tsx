// 场景：AstrBot 薄壳面板 — host.guest.mount（auth:none）；首帧品牌扫光；retain / 配置热重启。
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
} from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  WorkspaceAppBrandLogoLoaderPanelProps,
  WorkspaceAppHostApi,
} from "@agnx-lab/app-sdk";
import {
  ASTRBOT_APP_ID,
  ASTRBOT_CONFIG_KEY,
  ASTRBOT_ENSURE_TOOL_REL,
} from "./constants";
import {
  astrBotConfigToEnsureArgs,
  loadAstrBotConfigFromHost,
  type AstrBotAppConfigDocument,
} from "./astrbot-config";
import { bindAstrBotHost, requireBoundHost } from "./host-bind";
import {
  subscribeAstrBotRuntimeRestart,
  type AstrBotRuntimeRestartReason,
} from "./runtime-coordinator";

const WEB_ROOT_STYLE: CSSProperties = {
  flex: "1 1 0%",
  alignSelf: "stretch",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  backgroundColor: "transparent",
};

const GUEST_HOST_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

const BOOT_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  background: "rgb(9, 9, 11)",
};

const ERROR_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  display: "flex",
  flexDirection: "column",
  background: "rgba(9,9,11,0.88)",
};

const ERROR_FALLBACK_STYLE: CSSProperties = {
  ...ERROR_LAYER_STYLE,
  alignItems: "center",
  justifyContent: "center",
  color: "#a1a1aa",
  padding: 24,
  textAlign: "center",
};

const RETAIN_REASON = "astrbot-open";

const styles = StyleSheet.create(
  (theme) => ({
    fallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing[6],
      backgroundColor: "transparent",
    },
    fallbackText: {
      color: theme.colors.foregroundMuted,
      fontSize: theme.fontSize.sm,
      textAlign: "center",
    },
  }),
  "astrbot-panel",
);

export function bindAstrBotHarnessHost(host: WorkspaceAppHostApi): void {
  bindAstrBotHost(host);
}

function getHost(): WorkspaceAppHostApi {
  return requireBoundHost();
}

function canUseGuestSurface(): boolean {
  return typeof document !== "undefined" && getHost().platform.isWeb;
}

export function AstrBotPanel(_props: {
  appId: string;
  panelId: string;
  entityId: string;
}): ReactElement {
  const guestHostRef = useRef<HTMLDivElement | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retainCfgRef = useRef<AstrBotAppConfigDocument | null>(null);

  useEffect(() => {
    const host = getHost();
    let cancelled = false;
    void (async () => {
      const cfg = await loadAstrBotConfigFromHost(host.config);
      if (cancelled) {
        return;
      }
      retainCfgRef.current = cfg;
      host.background?.requestRetain?.({
        appId: ASTRBOT_APP_ID,
        active: true,
        reason: RETAIN_REASON,
      });
    })();
    return () => {
      cancelled = true;
      const keep = retainCfgRef.current?.keepRunningInBackground !== false;
      host.background?.requestRetain?.({
        appId: ASTRBOT_APP_ID,
        active: keep,
        reason: RETAIN_REASON,
      });
    };
  }, []);

  useEffect(() => {
    const host = getHost();
    if (!host.config?.subscribe) {
      return;
    }
    return host.config.subscribe({
      scope: "app",
      appId: ASTRBOT_APP_ID,
      key: ASTRBOT_CONFIG_KEY,
      emitCurrent: false,
      listener: () => {
        void loadAstrBotConfigFromHost(host.config).then((cfg) => {
          retainCfgRef.current = cfg;
        });
      },
    });
  }, []);

  useEffect(() => {
    if (!canUseGuestSurface()) {
      setBooting(false);
      setError("当前平台暂不支持嵌入 AstrBot，请使用 Agnx 桌面端。");
      return;
    }

    let cancelled = false;
    let unmountGuest: (() => void) | null = null;

    const mountGuest = async (options?: {
      forceRestart?: boolean;
      reason?: AstrBotRuntimeRestartReason;
    }) => {
      const host = getHost();
      const container = guestHostRef.current;
      if (!container) {
        return;
      }
      if (!host.guest?.mount) {
        if (!cancelled) {
          setBooting(false);
          setError("宿主未提供 host.guest（需升级 Agnx 并重新扫描子应用）");
        }
        return;
      }

      unmountGuest?.();
      unmountGuest = null;
      setBooting(true);
      setError(null);

      try {
        const cfg = await loadAstrBotConfigFromHost(host.config);
        retainCfgRef.current = cfg;
        const args = astrBotConfigToEnsureArgs(cfg, {
          forceRestart: options?.forceRestart === true,
        });
        if (cancelled || !guestHostRef.current) {
          return;
        }
        unmountGuest = host.guest.mount({
          container: guestHostRef.current,
          ensureTool: ASTRBOT_ENSURE_TOOL_REL,
          ensureArgs: args,
          timeoutMs: 300_000,
          bootOverlay: false,
          bootTitle: "正在启动 AstrBot…",
          onReady: () => {
            if (!cancelled) {
              setError(null);
              window.setTimeout(() => {
                if (!cancelled) {
                  setBooting(false);
                }
              }, 320);
            }
          },
          onError: (detail) => {
            if (!cancelled) {
              setBooting(false);
              setError(`${detail.code}: ${detail.message}`);
            }
          },
        });
      } catch (err) {
        if (!cancelled) {
          setBooting(false);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void mountGuest();

    const unsubscribeRestart = subscribeAstrBotRuntimeRestart((reason) => {
      void mountGuest({ forceRestart: true, reason });
    });

    return () => {
      cancelled = true;
      unsubscribeRestart();
      unmountGuest?.();
    };
  }, []);

  if (!canUseGuestSurface()) {
    return (
      <View style={styles.fallback} testID="workspace-mini-app-astrbot-unsupported">
        <Text style={styles.fallbackText}>{error ?? "请使用 Agnx 桌面端打开。"}</Text>
      </View>
    );
  }

  const BrandPanel = getHost().ui
    ?.BrandLogoLoaderPanel as ComponentType<WorkspaceAppBrandLogoLoaderPanelProps> | undefined;

  return (
    <div style={WEB_ROOT_STYLE} data-testid="workspace-mini-app-astrbot-root">
      <div
        ref={guestHostRef}
        data-agnx-guest-surface-host="true"
        data-testid="workspace-mini-app-astrbot-guest-host"
        style={GUEST_HOST_STYLE}
      />
      {booting && !error && BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={BOOT_LAYER_STYLE} role="status">
          <BrandPanel title="正在启动 AstrBot…" testID="astrbot-boot-overlay" />
        </div>
      ) : null}
      {booting && !error && !BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={ERROR_FALLBACK_STYLE} role="status">
          正在启动 AstrBot…
        </div>
      ) : null}
      {error && BrandPanel ? (
        <div style={ERROR_LAYER_STYLE} role="alert">
          <BrandPanel
            title={error}
            description="打开命令面板 → AstrBot → 详情，复制 Guest Surface。检查 uv / Python 3.12 / 端口。"
            testID="astrbot-mount-error"
          />
        </div>
      ) : null}
      {error && !BrandPanel ? (
        <div style={ERROR_FALLBACK_STYLE} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
