// 场景：AstrBot 运行时协调 — 配置变更后通知面板停旧再起。
export type AstrBotRuntimeRestartReason =
  | "port"
  | "data-dir"
  | "runtime-mode"
  | "bind"
  | "retain"
  | "manual";

type RestartListener = (reason: AstrBotRuntimeRestartReason) => void;

const listeners = new Set<RestartListener>();

export function subscribeAstrBotRuntimeRestart(listener: RestartListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAstrBotRuntimeNeedsRestart(reason: AstrBotRuntimeRestartReason): void {
  for (const listener of listeners) {
    listener(reason);
  }
}
