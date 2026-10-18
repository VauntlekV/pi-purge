/**
 * pi-purge — system prompt composition switch
 *
 * 用于提示词工程实验：在「宿主原样」「精简版」「只用自定义文件」三种系统提示词之间切换，
 * 观察同一问题下模型行为如何变化（指令遵循、提示词注入鲁棒性、人格设定实验）。
 *
 *  - replace: 去掉宿主提示词里的助手身份句与内置文档段，保留工具列表、Guidelines、项目上下文
 *  - append : 只把自定义文件挂到头部，宿主提示词原样保留（对照组）
 *  - strict : 宿主提示词整段不发送，只留自定义文件 + 工作目录（隔离变量）
 *
 * 关闭时不改动任何提示词、不读盘，pi 与未安装这个扩展时完全一致。
 * 状态存 <agent dir>/pi-purge.json（默认 ~/.pi/agent，可用 PI_CODING_AGENT_DIR 覆写）；
 * 源文件默认 ~/.pi/agent/purge.md，没有则退回 ~/.dsh/prompt-inject.md。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const CONFIG = join(AGENT_DIR, "pi-purge.json");
const SOURCE_CANDIDATES = [join(AGENT_DIR, "purge.md"), join(homedir(), ".dsh", "prompt-inject.md")];
const DEFAULT_SOURCE = SOURCE_CANDIDATES.find((path) => existsSync(path)) ?? SOURCE_CANDIDATES[0];

/** pi 默认提示词里的宿主身份句（system-prompt.js 模板首句）。 */
const HOST_IDENTITY = "You are an expert coding assistant operating inside pi, a coding agent harness.";
/** pi 文档段的起点与终点标记；任一处匹配不到就整段跳过，绝不猜边界。 */
const HOST_DOCS_START = "Pi documentation (read only when the user asks about pi itself";
const HOST_DOCS_END = "(e.g., tui.md for TUI API details)";

type Mode = "replace" | "append" | "strict";

interface PurgeState {
	enabled: boolean;
	source: string;
	mode: Mode;
}

function loadState(): PurgeState {
	try {
		// Windows 记事本/Set-Content 可能带 BOM，先剔掉再解析
		const raw = JSON.parse(readFileSync(CONFIG, "utf8").replace(/^\uFEFF/, "")) as Partial<PurgeState>;
		return {
			enabled: raw.enabled === true,
			source: typeof raw.source === "string" && raw.source.length > 0 ? raw.source : DEFAULT_SOURCE,
			mode: raw.mode === "append" ? "append" : raw.mode === "strict" ? "strict" : "replace",
		};
	} catch {
		return { enabled: false, source: DEFAULT_SOURCE, mode: "replace" };
	}
}

function saveState(state: PurgeState): void {
	mkdirSync(dirname(CONFIG), { recursive: true });
	writeFileSync(CONFIG, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/**
 * 从系统提示词里切掉宿主身份句和 pi 文档段。
 * 两处都用固定文案定位，匹配不到就原样返回 —— pi 升级改文案时退化为 append，
 * 而不是把整段提示词切坏。
 */
function stripHostPersona(systemPrompt: string): { text: string; identity: boolean; docs: boolean } {
	let text = systemPrompt;
	let identity = false;
	let docs = false;

	const identityAt = text.indexOf(HOST_IDENTITY);
	if (identityAt !== -1) {
		const lineEnd = text.indexOf("\n", identityAt);
		const cutEnd = lineEnd === -1 ? text.length : lineEnd + 1;
		text = text.slice(0, identityAt) + text.slice(cutEnd);
		identity = true;
	}

	const docsAt = text.indexOf(HOST_DOCS_START);
	if (docsAt !== -1) {
		const docsEndAt = text.indexOf(HOST_DOCS_END, docsAt + HOST_DOCS_START.length);
		if (docsEndAt !== -1) {
			let start = docsAt;
			while (start > 0 && text[start - 1] === "\n") start -= 1;
			const lineEnd = text.indexOf("\n", docsEndAt);
			const end = lineEnd === -1 ? text.length : lineEnd + 1;
			text = text.slice(0, start) + text.slice(end);
			docs = true;
		}
	}

	return { text, identity, docs };
}

export default function piPurge(pi: ExtensionAPI) {
	const state = loadState();
	let body = "";
	let loadError = "";
	// 上一轮 replace 的实况，/purge status 用来回答「这一轮到底改了什么」
	let lastCut = { identity: false, docs: false, at: 0 };

	const reload = (): boolean => {
		try {
			if (!existsSync(state.source)) throw new Error(`文件不存在: ${state.source}`);
			const text = readFileSync(state.source, "utf8").replace(/^\uFEFF/, "").trim();
			if (text.length === 0) throw new Error(`文件为空: ${state.source}`);
			body = text;
			loadError = "";
			return true;
		} catch (error) {
			body = "";
			loadError = error instanceof Error ? error.message : String(error);
			return false;
		}
	};

	// 关闭时不读盘：没开过的人完全感觉不到这个扩展
	if (state.enabled) reload();

	const paint = (ctx: { ui?: { setStatus?: (key: string, text?: string) => void } }) => {
		// -p / --mode json 没有 footer，setStatus 不能把会话搞挂
		try {
			ctx.ui?.setStatus?.("pi-purge", state.enabled ? "PURGE ON" : undefined);
		} catch {
			/* 非交互模式忽略 */
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		if (state.enabled && body.length === 0) reload();
		paint(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		if (!state.enabled || body.length === 0) return;

		let host = event.systemPrompt;
		if (state.mode === "strict") {
			// 等价 dsh 的 strict baseline：宿主提示词整段丢掉，只留工作目录，作为隔离变量。
			// 工具 schema 走 API 的 tools 参数，不依赖这段文字。
			const cwd = event.systemPromptOptions?.cwd;
			host = cwd ? `Current working directory: ${String(cwd).replace(/\\/g, "/")}` : "";
			const cut = stripHostPersona(event.systemPrompt);
			lastCut = { identity: cut.identity, docs: cut.docs, at: Date.now() };
		} else if (state.mode === "replace") {
			const cut = stripHostPersona(host);
			host = cut.text;
			lastCut = { identity: cut.identity, docs: cut.docs, at: Date.now() };
		}
		return { systemPrompt: host.length > 0 ? `${body}\n\n${host}` : body };
	});

	pi.registerCommand("purge", {
		description: "系统提示词实验开关：切换宿主提示词与自定义提示词文件（append / replace / strict）",
		getArgumentCompletions: (prefix: string) =>
			["on", "off", "status", "reload", "source", "mode"]
				.filter((value) => value.startsWith(prefix))
				.map((value) => ({ value, label: value })),
		handler: async (args: string, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const cmd = (parts[0] ?? "").toLowerCase();
			const arg = parts.slice(1).join(" ").trim();

			const notify = (text: string, level: "info" | "error" = "info") => ctx.ui.notify(text, level);

			if (cmd === "status" && body.length === 0) reload();

			const describe = () => {
				const cut = lastCut.at === 0
					? "尚未运行过一轮"
					: `身份段 ${lastCut.identity ? "已切除" : "未匹配"} / pi 文档段 ${lastCut.docs ? "已切除" : "未匹配"}`;
			const modeLabel = state.mode === "strict" ? "strict（只留人设+工作目录）" : state.mode === "replace" ? "replace（清宿主身份段）" : "append（只挂头部）";
				return [
					`状态: ${state.enabled ? "开启" : "关闭"}`,
					`模式: ${modeLabel}`,
					`源文件: ${state.source}`,
					body.length > 0 ? `正文: ${body.length} 字符` : `正文: 未加载${loadError ? `（${loadError}）` : ""}`,
					`上轮切除: ${cut}`,
				].join("\n");
			};

			const turnOn = () => {
				if (!reload()) return notify(`无法开启：${loadError}`, "error");
				state.enabled = true;
				saveState(state);
				paint(ctx);
				notify(`已开启（${state.mode}），每轮注入 ${body.length} 字符。\n${describe()}`);
			};

			const turnOff = () => {
				state.enabled = false;
				saveState(state);
				paint(ctx);
				notify("已关闭，恢复 pi 原始系统提示词。");
			};

			switch (cmd) {
				case "":
					if (state.enabled) turnOff();
					else turnOn();
					return;
				case "on":
				case "enable":
					return turnOn();
				case "off":
				case "disable":
					return turnOff();
				case "status":
					return notify(describe());
				case "reload":
					if (!reload()) return notify(`重载失败：${loadError}`, "error");
					return notify(`已重载 ${body.length} 字符。\n${describe()}`);
				case "mode": {
					const wanted = arg.toLowerCase();
					if (wanted !== "replace" && wanted !== "append" && wanted !== "strict") {
						return notify(`当前模式: ${state.mode}\n用法: /purge mode strict|replace|append\nstrict  = 只发自定义文件 + 工作目录（变量隔离）\nreplace = 去掉助手身份句与内置文档段\nappend  = 只把自定义文件挂头部（对照组）`, "error");
					}
					state.mode = wanted;
					saveState(state);
					return notify(`模式已切换为 ${wanted}。\n${describe()}`);
				}
				case "source": {
					if (!arg) return notify(`当前源文件: ${state.source}\n用法: /purge source <绝对路径>`, "error");
					const previous = state.source;
					state.source = arg.replace(/^["']|["']$/g, "");
					if (!reload()) {
						state.source = previous;
						reload();
						return notify(`切换失败：${loadError}`, "error");
					}
					saveState(state);
					return notify(`源文件已切换，正文 ${body.length} 字符。\n${describe()}`);
				}
				default:
					return notify(`未知子命令: ${cmd}\n用法: /purge [on|off|status|reload|mode|source <路径>]`);
			}
		},
	});
}
