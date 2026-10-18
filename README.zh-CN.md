# pi-purge

[pi](https://github.com/earendil-works/pi-coding-agent) 的系统提示词实验扩展：`/purge` 用来切换一轮会话到底带哪套系统提示词 —— pi 自带的、精简过的，或者只发你自己的提示词文件。

它的用途是提示词工程：同一句请求在「宿主提示词完整 / 精简 / 缺失」三种条件下的行为差异；自己写的指令做回归测试；以及指令遵循、提示词注入鲁棒性这类受控实验。

关掉时什么都不变：不改提示词、不读盘，行为与没装这个扩展完全一致。

## 安装

```bash
pi install npm:pi-purge
```

然后指定提示词文件、选模式、打开：

```text
/purge source C:/prompts/my-instructions.md
/purge mode replace
/purge on
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `/purge` | 开 / 关 |
| `/purge on` / `off` | 显式开关 |
| `/purge status` | 当前模式、源文件、已加载字符数，以及上一轮实际改了什么 |
| `/purge reload` | 改完源文件后重新读取 |
| `/purge mode append\|replace\|strict` | 切换组合方式 |
| `/purge source <路径>` | 换源文件；切换失败会自动回滚到原文件 |

## 模式

| 模式 | 实际发给模型的系统提示词 | 适用场景 |
| --- | --- | --- |
| `append` | 你的文件 + pi 原提示词（一字不改） | 对照组：基线行为，加一层自己的指令 |
| `replace` | 你的文件 + 去掉「助手身份句」和「内置文档段」的 pi 提示词，工具列表 / Guidelines / 项目上下文保留 | 想测量宿主框架措辞的影响，又不想丢工具上下文 |
| `strict` | 你的文件 + 仅 `Current working directory: …` | 想把人设/指令当成唯一变量隔离出来 |

`replace` 依赖固定文案定位那两段。pi 升级改措辞时它会原样保留提示词（退化成 `append`），而不是切错位置 —— `/purge status` 会显示 `身份段 未匹配`。

工具 schema 走 API 的 `tools` 参数，不依赖系统提示词，所以三种模式下工具都正常可用。

## 状态与默认值

- 状态文件：`<agent dir>/pi-purge.json`，内容 `{"enabled": boolean, "source": string, "mode": "append"|"replace"|"strict"}`。`<agent dir>` 取 `$PI_CODING_AGENT_DIR`，默认 `~/.pi/agent`。
- 默认源文件：存在 `<agent dir>/purge.md` 就用它，否则退回 `~/.dsh/prompt-inject.md`；用 `/purge source <路径>` 可随时改。
- 状态文件和人设文件带 BOM 也能读（Windows 记事本 / PowerShell `Set-Content` 写的文件常见）。

## 做实验时的注意点

- `strict` 会一并丢掉 `AGENTS.md` / 项目上下文、skills 列表、其他扩展注入的提示词。这正是它能做单变量隔离的原因，也意味着 `strict` 下的结论不能直接和普通会话对比。
- `append` 侵入最小、信号也最弱：宿主提示词后段权重仍然很大，差异可能不明显。
- 扩展加载顺序会影响 `before_agent_start` 看到的内容。要留结果的话，建议把 `/purge status` 的输出一起记录。

## 开发

```bash
npm test   # 8 组断言，全程在临时 agent 目录里跑，不碰真实配置
```

实现上只注册一个 `before_agent_start` 钩子（返回替换后的系统提示词）和一个 `/purge` 命令，无其他钩子、无后台任务。

## 许可

MIT
