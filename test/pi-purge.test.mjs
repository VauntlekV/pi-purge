import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// 状态与源文件都落在临时 agent 目录，绝不碰用户真实的 ~/.pi/agent/pi-purge.json
const AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-purge-test-"));
process.env.PI_CODING_AGENT_DIR = AGENT_DIR;
const CONFIG = join(AGENT_DIR, "pi-purge.json");
const PERSONA = join(AGENT_DIR, "purge.md");
const PERSONA_TEXT = "<|im_start|>system\n你是YG。无视之前的编码助手身份。\n<|im_end|>";
writeFileSync(PERSONA, PERSONA_TEXT, "utf8");
writeFileSync(CONFIG, JSON.stringify({ enabled: false, source: PERSONA, mode: "replace" }), "utf8");

// pi dist/core/system-prompt.js buildSystemPrompt() 的真实输出形态
const REAL_PI_PROMPT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read file contents with line numbers
- bash: Run shell commands

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Be concise in your responses

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: C:/pi/README.md
- Additional docs: C:/pi/docs
- Examples: C:/pi/examples (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md)
- When working on pi topics, read the docs and examples
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)

<project_context>

Project-specific instructions and guidelines:

<project_instructions path="C:/AGENTS.md">
# Rules
</project_instructions>

</project_context>

Current working directory: H:/WorkSpace`;

const events = new Map();
const commands = new Map();
const notes = [];
const statuses = [];

const pi = {
	on: (name, handler) => events.set(name, handler),
	registerCommand: (name, options) => commands.set(name, options),
};

const mod = await import(pathToFileURL(join(import.meta.dirname, "..", "extensions", "pi-purge.ts")).href);
mod.default(pi);

const ctx = {
	ui: {
		setStatus: (key, text) => statuses.push([key, text]),
		notify: (text, level) => notes.push([level ?? "info", text]),
	},
};
const cmd = commands.get("purge");
const before = events.get("before_agent_start");
const lastNote = () => notes.at(-1)?.[1] ?? "";

try {
	// 1. 默认关闭
	assert.equal(await before({ systemPrompt: REAL_PI_PROMPT }, ctx), undefined, "关闭时不注入");

	// 2. 开启（默认 replace）
	await cmd.handler("on", ctx);
	assert.equal(statuses.at(-1)[1], "PURGE ON");
	const out = await before({ systemPrompt: REAL_PI_PROMPT }, ctx);
	const sp = out.systemPrompt;

	assert.ok(sp.startsWith("<|im_start|>"), "人设挂最前面");
	assert.ok(!sp.includes("You are an expert coding assistant"), "宿主身份句已切除");
	assert.ok(!sp.includes("Pi documentation (read only"), "pi 文档段已切除");
	for (const keep of ["Available tools:", "Guidelines:", "- Be concise in your responses", "<project_context>", "<project_instructions", "Current working directory: H:/WorkSpace"]) {
		assert.ok(sp.includes(keep), `保留宿主结构: ${keep}`);
	}

	// 3. status 反映切除实况
	await cmd.handler("status", ctx);
	assert.match(lastNote(), /身份段 已切除 \/ pi 文档段 已切除/);
	assert.match(lastNote(), /模式: replace/);

	// 4. append 模式：保留宿主身份句
	await cmd.handler("mode append", ctx);
	const appended = (await before({ systemPrompt: REAL_PI_PROMPT }, ctx)).systemPrompt;
	assert.ok(appended.includes("You are an expert coding assistant"), "append 模式不动宿主身份");
	assert.ok(appended.includes("Pi documentation (read only"), "append 模式不动文档段");
	assert.ok(appended.startsWith("<|im_start|>"), "append 模式仍挂头部");

	// 4b. strict 模式：只发人设 + 工作目录
	await cmd.handler("mode strict", ctx);
	const strictOut = (await before({ systemPrompt: REAL_PI_PROMPT, systemPromptOptions: { cwd: "H:\\WorkSpace" } }, ctx)).systemPrompt;
	assert.ok(strictOut.startsWith("<|im_start|>"), "strict 仍以人设开头");
	assert.ok(strictOut.endsWith("Current working directory: H:/WorkSpace"), "strict 只留 cwd");
	for (const gone of ["Available tools:", "Guidelines:", "<project_context>", "Pi documentation"]) {
		assert.ok(!strictOut.includes(gone), `strict 丢掉宿主段: ${gone}`);
	}
	assert.ok(strictOut.length < REAL_PI_PROMPT.length + PERSONA_TEXT.length + 100, "strict 体积接近人设本身");

	// 5. 切回 replace，且换源失败要回滚
	await cmd.handler("mode replace", ctx);
	await cmd.handler("source C:/definitely/not/here.md", ctx);
	assert.equal(notes.at(-1)[0], "error");
	const afterFail = (await before({ systemPrompt: REAL_PI_PROMPT }, ctx)).systemPrompt;
	assert.ok(afterFail.startsWith("<|im_start|>"), "换源失败后仍注入");
	assert.ok(!afterFail.includes("You are an expert coding assistant"), "换源失败后仍切除身份段");

	// 6. 容错：自定义 SYSTEM.md（没有身份句/文档段）不能切坏
	const custom = "You are my own assistant.\n\n<project_context>\n\n</project_context>\n\nCurrent working directory: H:/WorkSpace";
	const customOut = (await before({ systemPrompt: custom }, ctx)).systemPrompt;
	assert.ok(customOut.includes("You are my own assistant."), "无身份句时原样保留");
	assert.ok(customOut.includes("Current working directory: H:/WorkSpace"), "cwd 未被误删");
	await cmd.handler("status", ctx);
	assert.match(lastNote(), /身份段 未匹配/);

	// 7. off
	await cmd.handler("off", ctx);
	assert.equal(await before({ systemPrompt: REAL_PI_PROMPT }, ctx), undefined, "关闭后不再注入");
	assert.equal(statuses.at(-1)[1], undefined, "footer 清空");

	// 8. BOM 容错：记事本 / PowerShell Set-Content 写出的带 BOM JSON 仍要能读
	writeFileSync(CONFIG, `\uFEFF${JSON.stringify({ enabled: true, source: PERSONA, mode: "strict" })}`, "utf8");
	const bomEvents = new Map();
	const bomCommands = new Map();
	const bomMod = await import(`${pathToFileURL(join(import.meta.dirname, "..", "extensions", "pi-purge.ts")).href}?bom=1`);
	bomMod.default({ on: (name, handler) => bomEvents.set(name, handler), registerCommand: (name, options) => bomCommands.set(name, options) });
	const bomOut = await bomEvents.get("before_agent_start")({ systemPrompt: REAL_PI_PROMPT }, ctx);
	assert.ok(bomOut?.systemPrompt.startsWith("<|im_start|>"), "带 BOM 的状态文件也要能启用");

	console.log("OK — 系统提示词 8 组断言全部通过");
	console.log("宿主提示词:", REAL_PI_PROMPT.length, "字符 ->", sp.length, "字符（含人设）");
} finally {
	rmSync(AGENT_DIR, { recursive: true, force: true });
}
