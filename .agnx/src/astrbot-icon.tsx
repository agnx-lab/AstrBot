// 场景：AstrBot 侧栏/命令图标 — 优先用上游 favicon；无 URL 时用可识别单色 Bot 标。
import { createElement, type ReactElement } from "react";
import Svg, { Path } from "react-native-svg";

export function AstrBotIcon(props: {
  size?: number;
  color?: string;
}): ReactElement {
  const size = props.size ?? 20;
  const color = props.color ?? "currentColor";
  return createElement(
    Svg,
    { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
    createElement(Path, {
      d: "M12 2c-1.5 3.5-4.2 6.2-7.7 7.7C8 11.2 10.7 13.9 12 17.4c1.3-3.5 4-6.2 7.7-7.7C16.2 8.2 13.5 5.5 12 2z",
      fill: color,
      opacity: 0.9,
    }),
    createElement(Path, {
      d: "M18.5 14.2c-.7 1.7-2 3-3.7 3.7 1.7.7 3 2 3.7 3.7.7-1.7 2-3 3.7-3.7-1.7-.7-3-2-3.7-3.7z",
      fill: color,
      opacity: 0.75,
    }),
  );
}
