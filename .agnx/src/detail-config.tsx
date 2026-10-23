// 场景：详情「配置」— port / dataDir / runtimeMode / uvPath / bindLoopback / retain；密码只说明链上游。
import { createElement, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import type { WorkspaceAppHostApi } from "@agnx-lab/app-sdk";
import { ASTRBOT_APP_ID, DEFAULT_ASTRBOT_PORT, type AstrBotRuntimeMode } from "./constants";
import { getBoundHost } from "./host-bind";
import {
  defaultAstrBotAppConfigDocument,
  loadAstrBotConfigFromHost,
  saveAstrBotConfigToHost,
  type AstrBotAppConfigDocument,
} from "./astrbot-config";
import { notifyAstrBotRuntimeNeedsRestart } from "./runtime-coordinator";

let cachedConfig: AstrBotAppConfigDocument = defaultAstrBotAppConfigDocument();

export function getCachedAstrBotConfig(): AstrBotAppConfigDocument {
  return cachedConfig;
}

function setCachedAstrBotConfig(next: AstrBotAppConfigDocument): void {
  cachedConfig = next;
}

function useDetailLayoutStyles() {
  const { theme } = useUnistyles();
  const dark = theme.colorScheme !== "light";
  return useMemo(() => {
    const column: ViewStyle = {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      alignSelf: "stretch",
      width: "100%",
      gap: 8,
      minWidth: 0,
    };
    const row: ViewStyle = {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    };
    const muted: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.foregroundMuted,
    };
    const ok: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.statusSuccess || "#15803d",
    };
    const warn: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.statusWarning || theme.colors.statusDanger,
    };
    const input = (focused: boolean): TextStyle => ({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 72,
      fontSize: 12,
      lineHeight: 16,
      borderWidth: 1.5,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      minHeight: 32,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      color: theme.colors.foreground,
      borderColor: focused
        ? theme.colors.accent
        : dark
          ? "rgba(255,255,255,0.35)"
          : "rgba(0,0,0,0.22)",
      backgroundColor: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.92)",
    });
    return { column, row, muted, ok, warn, input };
  }, [dark, theme]);
}

function DetailChip({
  label,
  busy,
  disabled,
  tone,
  onPress,
  testID,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  tone?: "accent" | "default";
  onPress: () => void;
  testID?: string;
}): ReactElement | null {
  const Chip = getBoundHost()?.ui?.Chip;
  if (!Chip) {
    return null;
  }
  return createElement(Chip, {
    label: busy ? "…" : label,
    tone: tone ?? "default",
    busy,
    disabled: disabled || busy,
    onPress,
    testID,
    accessibilityLabel: label,
  });
}

function RuntimeDetailField(): ReactElement {
  const styles = useDetailLayoutStyles();
  const [portText, setPortText] = useState(String(cachedConfig.port));
  const [dataDir, setDataDir] = useState(cachedConfig.dataDir);
  const [uvPath, setUvPath] = useState(cachedConfig.uvPath);
  const [runtimeMode, setRuntimeMode] = useState<AstrBotRuntimeMode>(cachedConfig.runtimeMode);
  const [bindLoopbackOnly, setBindLoopbackOnly] = useState(cachedConfig.bindLoopbackOnly);
  const [keepRunning, setKeepRunning] = useState(cachedConfig.keepRunningInBackground);
  const [portFocused, setPortFocused] = useState(false);
  const [dataFocused, setDataFocused] = useState(false);
  const [uvFocused, setUvFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const host = getBoundHost();
        if (!host) {
          return;
        }
        const loaded = await loadAstrBotConfigFromHost(host.config);
        if (cancelled) {
          return;
        }
        setCachedAstrBotConfig(loaded);
        setPortText(String(loaded.port));
        setDataDir(loaded.dataDir);
        setUvPath(loaded.uvPath);
        setRuntimeMode(loaded.runtimeMode);
        setBindLoopbackOnly(loaded.bindLoopbackOnly);
        setKeepRunning(loaded.keepRunningInBackground);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = useCallback(async () => {
    const host = getBoundHost();
    if (!host) {
      return;
    }
    const port = Number(portText);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      setError(`端口无效（默认 ${DEFAULT_ASTRBOT_PORT}）`);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    const before = cachedConfig;
    try {
      const saved = await saveAstrBotConfigToHost(host.config, {
        port: Math.floor(port),
        dataDir: dataDir.trim(),
        uvPath: uvPath.trim(),
        runtimeMode,
        bindLoopbackOnly,
        keepRunningInBackground: keepRunning,
      });
      setCachedAstrBotConfig(saved);
      const needRestart =
        saved.port !== before.port ||
        saved.dataDir !== before.dataDir ||
        saved.runtimeMode !== before.runtimeMode ||
        saved.uvPath !== before.uvPath ||
        saved.bindLoopbackOnly !== before.bindLoopbackOnly;
      if (needRestart) {
        notifyAstrBotRuntimeNeedsRestart(
          saved.runtimeMode !== before.runtimeMode
            ? "runtime-mode"
            : saved.port !== before.port
              ? "port"
              : saved.dataDir !== before.dataDir
                ? "data-dir"
                : "bind",
        );
        setSuccess("已保存；AstrBot 正在按新配置热重启。");
      } else if (saved.keepRunningInBackground !== before.keepRunningInBackground) {
        notifyAstrBotRuntimeNeedsRestart("retain");
        setSuccess("已保存后台保持运行偏好（下次关 Tab 生效）。");
      } else {
        setSuccess("已保存。");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [portText, dataDir, uvPath, runtimeMode, bindLoopbackOnly, keepRunning]);

  return (
    <View style={styles.column} testID="astrbot-runtime-field">
      <Text style={styles.muted}>Dashboard 端口（默认 {DEFAULT_ASTRBOT_PORT}）</Text>
      <TextInput
        style={styles.input(portFocused)}
        value={portText}
        onChangeText={setPortText}
        onFocus={() => setPortFocused(true)}
        onBlur={() => setPortFocused(false)}
        keyboardType="number-pad"
        autoCapitalize="none"
        testID="astrbot-port-input"
      />
      <Text style={styles.muted}>dataDir（ASTRBOT_ROOT；空 = $AGNX_HOME/apps/data/astrbot）</Text>
      <TextInput
        style={styles.input(dataFocused)}
        value={dataDir}
        onChangeText={setDataDir}
        onFocus={() => setDataFocused(true)}
        onBlur={() => setDataFocused(false)}
        placeholder="留空用默认数据根"
        placeholderTextColor={styles.muted.color}
        autoCapitalize="none"
        testID="astrbot-datadir-input"
      />
      <Text style={styles.muted}>uv 可执行路径（可选覆盖）</Text>
      <TextInput
        style={styles.input(uvFocused)}
        value={uvPath}
        onChangeText={setUvPath}
        onFocus={() => setUvFocused(true)}
        onBlur={() => setUvFocused(false)}
        placeholder="默认探测 PATH / ~/.local/bin/uv"
        placeholderTextColor={styles.muted.color}
        autoCapitalize="none"
        testID="astrbot-uvpath-input"
      />
      <View style={styles.row}>
        <DetailChip
          label={runtimeMode === "uv" ? "● uv" : "uv"}
          tone={runtimeMode === "uv" ? "accent" : "default"}
          onPress={() => setRuntimeMode("uv")}
          testID="astrbot-mode-uv"
        />
        <DetailChip
          label={runtimeMode === "docker" ? "● docker" : "docker"}
          tone={runtimeMode === "docker" ? "accent" : "default"}
          onPress={() => setRuntimeMode("docker")}
          testID="astrbot-mode-docker"
        />
        <DetailChip
          label={bindLoopbackOnly ? "● 仅 loopback" : "仅 loopback"}
          tone={bindLoopbackOnly ? "accent" : "default"}
          onPress={() => setBindLoopbackOnly((v) => !v)}
          testID="astrbot-bind-loopback"
        />
        <DetailChip
          label={keepRunning ? "● 后台保持" : "后台保持"}
          tone={keepRunning ? "accent" : "default"}
          onPress={() => setKeepRunning((v) => !v)}
          testID="astrbot-keep-running"
        />
      </View>
      <View style={styles.row}>
        <DetailChip
          label="保存并应用"
          tone="accent"
          busy={busy}
          onPress={() => {
            void onSave();
          }}
          testID="astrbot-config-save"
        />
      </View>
      {error ? <Text style={styles.warn}>{error}</Text> : null}
      {success ? <Text style={styles.ok}>{success}</Text> : null}
    </View>
  );
}

function AuthHintSection(): ReactElement {
  const styles = useDetailLayoutStyles();
  return (
    <View style={styles.column} testID="astrbot-auth-hint">
      <Text style={styles.muted}>
        用户名默认 astrbot。密码 / TOTP 只在上游 WebUI 设置；Host 不存明文。打开 Tab
        后在 Dashboard 登录一次即可（cookie 留在 Guest 分区）。
      </Text>
    </View>
  );
}

function ReloadSection(): ReactElement {
  const styles = useDetailLayoutStyles();
  return (
    <View style={styles.row} testID="astrbot-reload">
      <DetailChip
        label="强制重启 sidecar"
        tone="accent"
        onPress={() => notifyAstrBotRuntimeNeedsRestart("manual")}
        testID="astrbot-force-restart"
      />
      <Text style={styles.muted}>整窗强刷用 ⌘⇧R</Text>
    </View>
  );
}

export function registerAstrBotDetailConfig(host: WorkspaceAppHostApi): () => void {
  if (!host.ui?.registerDetailSheetExtras) {
    return () => {};
  }
  void loadAstrBotConfigFromHost(host.config).then((loaded) => {
    setCachedAstrBotConfig(loaded);
  });
  return host.ui.registerDetailSheetExtras({
    appId: ASTRBOT_APP_ID,
    surface: "config",
    buildRows: () => {
      const cfg = getCachedAstrBotConfig();
      return [
        {
          label: "运行时",
          value: `${cfg.runtimeMode} · :${cfg.port}`,
          helpText: "port / dataDir / uv|docker / loopback / 后台保持。",
          groupId: "astrbot-runtime",
          groupTitle: "AstrBot",
          valueContent: createElement(RuntimeDetailField),
        },
        {
          label: "登录",
          value: "上游 WebUI",
          helpText: "密码不进 host.config。",
          groupId: "astrbot-runtime",
          groupTitle: "AstrBot",
          valueContent: createElement(AuthHintSection),
        },
        {
          label: "重新加载",
          value: "Tab / sidecar",
          helpText: "强制重拉 ensure + Guest。",
          groupId: "astrbot-runtime",
          groupTitle: "AstrBot",
          valueContent: createElement(ReloadSection),
        },
      ];
    },
  });
}
