#!/usr/bin/env node
/**
 * 场景：短跑 sidecar — 确保 AstrBot Dashboard 已起（默认 uv；高级 docker）。
 * 用法：node .agnx/tools/ensure-astrbot.mjs [--work-dir <dataRoot>] [--port <n>]
 *       [--data-dir <ASTRBOT_ROOT>] [--runtime-mode uv|docker] [--uv-path <bin>]
 *       [--bind-loopback-only true|false] [--supervised] [--force-restart]
 *
 * 环境合同（上游 astrbot_path / dashboard server，禁止猜破坏性 env）：
 * - ASTRBOT_ROOT → get_astrbot_root()；数据落在 $ASTRBOT_ROOT/data
 * - DASHBOARD_PORT / ASTRBOT_DASHBOARD_PORT
 * - DASHBOARD_HOST / ASTRBOT_DASHBOARD_HOST（loopback 默认 127.0.0.1）
 * - TZ
 * - AGNX_ALLOW_IFRAME=1（预留给上游 framing 门控补丁；主 Dashboard 当前通常无 XFO）
 *
 * stdout：单行 JSON { ok, origin, reused?, pid?, plan?, warnings? }
 */
import { execFile, execFileSync, spawn } from "node:child_process";
import { access, constants as fsConstants, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** clone 根 = astrbot 仓根 */
const repoRoot = path.resolve(__dirname, "../..");
const defaultPort = 6185;
const DEFAULT_RUNTIME_MODE = "uv";

function parseArgs(argv) {
  let workDir = process.env.AGNX_APP_DATA_ROOT || "";
  let dataDir = "";
  let port = defaultPort;
  let runtimeMode = DEFAULT_RUNTIME_MODE;
  let uvPath = "";
  let bindLoopbackOnly = true;
  let forceRestart = false;
  let supervised = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--work-dir" || arg === "--workDir") && next) {
      workDir = String(next).trim();
      i += 1;
    } else if ((arg === "--data-dir" || arg === "--dataDir") && next) {
      dataDir = String(next).trim();
      i += 1;
    } else if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) {
        port = Math.floor(n);
      }
      i += 1;
    } else if ((arg === "--runtime-mode" || arg === "--runtimeMode") && next) {
      runtimeMode = next === "docker" ? "docker" : "uv";
      i += 1;
    } else if ((arg === "--uv-path" || arg === "--uvPath" || arg === "--python") && next) {
      // --python 兼容详情字段名；实际用作 uv 可执行覆盖
      uvPath = String(next).trim();
      i += 1;
    } else if ((arg === "--bind-loopback-only" || arg === "--bindLoopbackOnly") && next) {
      bindLoopbackOnly = !(next === "false" || next === "0" || next === "no");
      i += 1;
    } else if (arg === "--force-restart" || arg === "--forceRestart") {
      forceRestart = true;
    } else if (arg === "--supervised") {
      supervised = true;
    }
  }
  const resolvedWork =
    workDir ||
    path.join(
      process.env.AGNX_HOME || path.join(process.env.HOME || "", ".agnx-dev"),
      "apps",
      "data",
      "astrbot",
    );
  const resolvedData = dataDir ? path.resolve(dataDir) : resolvedWork;
  return {
    workDir: resolvedWork,
    dataDir: resolvedData,
    port,
    runtimeMode,
    uvPath: uvPath || process.env.AGNX_UV_PATH || "uv",
    bindLoopbackOnly,
    forceRestart,
    supervised,
    repoRoot,
  };
}

function fingerprint(cfg) {
  return JSON.stringify({
    repoRoot: cfg.repoRoot,
    port: cfg.port,
    dataDir: cfg.dataDir,
    runtimeMode: cfg.runtimeMode,
    uvPath: cfg.uvPath,
    bindLoopbackOnly: cfg.bindLoopbackOnly,
  });
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readState(statePath) {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeState(statePath, payload) {
  await writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function httpGetOk(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      // 登录页 / SPA 可能 200；部分路由 3xx/401 也算进程已起
      const code = res.statusCode;
      resolve(code != null && code >= 200 && code < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function isDashboardHealthy(port) {
  return httpGetOk(`http://127.0.0.1:${port}/`);
}

async function waitForHealth(port, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isDashboardHealthy(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return false;
}

function whichSync(bin) {
  try {
    const out = execFileSync("which", [bin], { encoding: "utf8", timeout: 8_000 });
    return out.trim() || null;
  } catch {
    return null;
  }
}

async function resolveUvBin(uvPath) {
  if (uvPath && uvPath !== "uv" && (await pathExists(uvPath))) {
    return uvPath;
  }
  const fromWhich = whichSync(uvPath || "uv");
  if (fromWhich) {
    return fromWhich;
  }
  const home = process.env.HOME || "";
  const candidates = [
    path.join(home, ".local/bin/uv"),
    "/usr/local/bin/uv",
    "/opt/homebrew/bin/uv",
  ];
  for (const c of candidates) {
    if (await pathExists(c)) {
      return c;
    }
  }
  return null;
}

async function isUvEnvReady(repoRoot) {
  // .venv 空壳不算就绪（失败半截也会留下目录）
  const probes = [
    path.join(repoRoot, ".venv/lib/python3.12/site-packages/quart"),
    path.join(repoRoot, ".venv/lib/python3.12/site-packages/astrbot"),
    path.join(repoRoot, ".venv/lib/python3.13/site-packages/quart"),
  ];
  for (const probe of probes) {
    if (await pathExists(probe)) {
      return true;
    }
  }
  return false;
}

function formatExecError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  const stderr =
    error && typeof error === "object" && "stderr" in error
      ? String(error.stderr || "").slice(-1200)
      : "";
  return `${msg}${stderr ? `；${stderr}` : ""}`;
}

async function runUvSync(uvBin, repoRoot) {
  await execFileAsync(uvBin, ["sync", "--python", "3.12"], {
    cwd: repoRoot,
    timeout: 600_000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
    },
  });
}

async function ensureUvSynced(cfg, warnings) {
  const uvBin = await resolveUvBin(cfg.uvPath);
  if (!uvBin) {
    return {
      ok: false,
      error:
        "未找到 uv。请安装 https://docs.astral.sh/uv/ 后重试，或在详情配置填写 uvPath。",
    };
  }
  const pyproject = path.join(cfg.repoRoot, "pyproject.toml");
  if (!(await pathExists(pyproject))) {
    return { ok: false, error: `缺少 pyproject.toml：${cfg.repoRoot}` };
  }
  if (await isUvEnvReady(cfg.repoRoot)) {
    return { ok: true, uvBin };
  }
  warnings.push("首次 uv sync --python 3.12（可能较久）…");
  // 真树 pyproject 含 [tool.uv] override-dependencies faiss-cpu==1.12.0（旧 macOS 兼容，见 EMBED.md）
  try {
    await runUvSync(uvBin, cfg.repoRoot);
    if (!(await isUvEnvReady(cfg.repoRoot))) {
      return {
        ok: false,
        error: "uv sync 结束但未检测到 quart/astrbot 包，请检查网络或手动 uv sync",
      };
    }
    return { ok: true, uvBin };
  } catch (error) {
    return {
      ok: false,
      error: `uv sync 失败：${formatExecError(error)}`,
    };
  }
}

function buildUvEnv(cfg) {
  return {
    ASTRBOT_ROOT: cfg.dataDir,
    DASHBOARD_PORT: String(cfg.port),
    ASTRBOT_DASHBOARD_PORT: String(cfg.port),
    DASHBOARD_HOST: cfg.bindLoopbackOnly ? "127.0.0.1" : "0.0.0.0",
    ASTRBOT_DASHBOARD_HOST: cfg.bindLoopbackOnly ? "127.0.0.1" : "0.0.0.0",
    TZ: process.env.TZ || "Asia/Shanghai",
    AGNX_ALLOW_IFRAME: "1",
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

async function dockerAvailable() {
  try {
    await execFileAsync("docker", ["info"], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureDocker(cfg, warnings, statePath) {
  if (!(await dockerAvailable())) {
    return {
      ok: false,
      error: "本机 Docker 不可用。请安装 Docker 或将 runtimeMode 改回 uv。",
    };
  }
  const composeFile = path.join(cfg.repoRoot, "compose.yml");
  if (!(await pathExists(composeFile))) {
    return { ok: false, error: `缺少 compose.yml：${composeFile}` };
  }
  await mkdir(path.join(cfg.dataDir, "data"), { recursive: true });

  if (cfg.forceRestart) {
    try {
      await execFileAsync(
        "docker",
        ["compose", "-f", composeFile, "down", "--remove-orphans"],
        { cwd: cfg.repoRoot, timeout: 120_000, env: { ...process.env } },
      );
    } catch {
      warnings.push("docker compose down 未完全成功，继续 up");
    }
  }

  if (!cfg.forceRestart && (await isDashboardHealthy(cfg.port))) {
    const state = {
      fingerprint: fingerprint(cfg),
      port: cfg.port,
      runtimeMode: "docker",
      pid: null,
      dataDir: cfg.dataDir,
      updatedAt: Date.now(),
    };
    await writeState(statePath, state);
    return {
      ok: true,
      reused: true,
      port: cfg.port,
      origin: `http://127.0.0.1:${cfg.port}`,
      pid: null,
      runtimeMode: "docker",
      warnings,
    };
  }

  // 用 -p astrbot-agnx 隔离项目名；端口与 volume 覆盖
  const project = "astrbot-agnx";
  const dataBind = `${path.join(cfg.dataDir, "data")}:/AstrBot/data`;
  try {
    await execFileAsync(
      "docker",
      [
        "compose",
        "-f",
        composeFile,
        "-p",
        project,
        "up",
        "-d",
        "--remove-orphans",
      ],
      {
        cwd: cfg.repoRoot,
        timeout: 300_000,
        env: {
          ...process.env,
          TZ: process.env.TZ || "Asia/Shanghai",
        },
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `docker compose up 失败：${msg.slice(0, 500)}` };
  }

  // 若默认 compose 绑 6185 与配置端口不同，补一层 publish 说明
  if (cfg.port !== 6185) {
    warnings.push(
      `docker compose 默认映射 6185；详情 port=${cfg.port} 时请自行改 compose 或改回 6185`,
    );
  }
  warnings.push(`volume 建议确认 data 挂载；当前 dataDir=${cfg.dataDir}`);

  const ready = await waitForHealth(cfg.port === 6185 ? 6185 : cfg.port, 180_000);
  const livePort = ready ? (cfg.port === 6185 ? 6185 : cfg.port) : cfg.port;
  if (!ready && !(await isDashboardHealthy(6185))) {
    return {
      ok: false,
      error: `Docker 启动后 Dashboard 探活超时（端口 ${cfg.port}/6185）`,
      warnings,
    };
  }
  const finalPort = (await isDashboardHealthy(cfg.port)) ? cfg.port : 6185;
  const state = {
    fingerprint: fingerprint(cfg),
    port: finalPort,
    runtimeMode: "docker",
    pid: null,
    dataDir: cfg.dataDir,
    updatedAt: Date.now(),
  };
  await writeState(statePath, state);
  void dataBind;
  void livePort;
  return {
    ok: true,
    reused: false,
    port: finalPort,
    origin: `http://127.0.0.1:${finalPort}`,
    pid: null,
    runtimeMode: "docker",
    warnings,
  };
}

async function tryReusedUv(cfg, statePath, wantedFp) {
  if (cfg.forceRestart) {
    return null;
  }
  if (!(await isDashboardHealthy(cfg.port))) {
    return null;
  }
  const state = await readState(statePath);
  const sameFp = state && String(state.fingerprint || "") === wantedFp;
  return {
    ok: true,
    reused: true,
    port: cfg.port,
    origin: `http://127.0.0.1:${cfg.port}`,
    pid: state?.pid ?? null,
    runtimeMode: "uv",
    fingerprint: wantedFp,
    sameFingerprint: sameFp,
  };
}

async function buildSupervisedUvPlan(cfg, warnings, wantedFp) {
  const synced = await ensureUvSynced(cfg, warnings);
  if (!synced.ok) {
    return synced;
  }
  await mkdir(cfg.dataDir, { recursive: true });
  const healthUrl = `http://127.0.0.1:${cfg.port}/`;
  return {
    ok: true,
    plan: {
      command: synced.uvBin,
      args: ["run", "--python", "3.12", "main.py"],
      cwd: cfg.repoRoot,
      env: buildUvEnv(cfg),
      fingerprint: wantedFp,
      healthUrl,
      port: cfg.port,
      launchMode: "uv",
    },
  };
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const warnings = [];
  await mkdir(cfg.workDir, { recursive: true });
  await mkdir(cfg.dataDir, { recursive: true });
  const statePath = path.join(cfg.workDir, "astrbot.json");
  const wantedFp = fingerprint(cfg);

  if (!(await pathExists(path.join(cfg.repoRoot, "main.py")))) {
    console.log(
      JSON.stringify({
        ok: false,
        error: `缺少 main.py：${cfg.repoRoot}（请确认已 clone AstrBot 真树）`,
      }),
    );
    process.exitCode = 1;
    return;
  }

  if (cfg.runtimeMode === "docker") {
    // docker：ensure 自管 compose；--supervised 时以 reused/origin 早退，不返回 uv plan
    const dockerResult = await ensureDocker(cfg, warnings, statePath);
    if (cfg.supervised) {
      if (!dockerResult.ok) {
        console.log(JSON.stringify({ ...dockerResult, warnings }));
        process.exitCode = 1;
        return;
      }
      // 对 daemon：标 reused，走 finalizeSupervisedReuse early，避免缺 plan
      console.log(
        JSON.stringify({
          ok: true,
          reused: true,
          port: dockerResult.port,
          origin: dockerResult.origin,
          pid: null,
          runtimeMode: "docker",
          warnings: dockerResult.warnings || warnings,
        }),
      );
      return;
    }
    console.log(JSON.stringify({ ...dockerResult, warnings: dockerResult.warnings || warnings }));
    if (!dockerResult.ok) {
      process.exitCode = 1;
    }
    return;
  }

  // uv 模式
  if (cfg.supervised) {
    const reused = await tryReusedUv(cfg, statePath, wantedFp);
    if (reused) {
      console.log(
        JSON.stringify({
          ...reused,
          healthUrl: `http://127.0.0.1:${cfg.port}/`,
          warnings,
        }),
      );
      return;
    }
    const planned = await buildSupervisedUvPlan(cfg, warnings, wantedFp);
    if (!planned.ok) {
      console.log(JSON.stringify({ ...planned, warnings, repoRoot: cfg.repoRoot }));
      process.exitCode = 1;
      return;
    }
    console.log(
      JSON.stringify({
        ok: true,
        reused: false,
        plan: planned.plan,
        warnings,
        repoRoot: cfg.repoRoot,
        runtimeMode: "uv",
      }),
    );
    return;
  }

  // 非 supervised：ensure 自行 spawn（调试用）
  const reused = await tryReusedUv(cfg, statePath, wantedFp);
  if (reused) {
    console.log(JSON.stringify({ ...reused, warnings }));
    return;
  }
  const planned = await buildSupervisedUvPlan(cfg, warnings, wantedFp);
  if (!planned.ok) {
    console.log(JSON.stringify({ ...planned, warnings }));
    process.exitCode = 1;
    return;
  }
  const child = spawn(planned.plan.command, planned.plan.args, {
    cwd: planned.plan.cwd,
    env: { ...process.env, ...planned.plan.env },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const ready = await waitForHealth(cfg.port, 180_000);
  if (!ready) {
    try {
      if (child.pid) {
        process.kill(child.pid, "SIGTERM");
      }
    } catch {
      // ignore
    }
    console.log(
      JSON.stringify({
        ok: false,
        error: `AstrBot Dashboard 探活超时（端口 ${cfg.port}）`,
        warnings,
      }),
    );
    process.exitCode = 1;
    return;
  }
  await writeState(statePath, {
    fingerprint: wantedFp,
    port: cfg.port,
    runtimeMode: "uv",
    pid: child.pid ?? null,
    dataDir: cfg.dataDir,
    updatedAt: Date.now(),
  });
  console.log(
    JSON.stringify({
      ok: true,
      reused: false,
      port: cfg.port,
      origin: `http://127.0.0.1:${cfg.port}`,
      pid: child.pid ?? null,
      runtimeMode: "uv",
      warnings,
    }),
  );
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
