# pi-purge

[English](README.md) | [中文](README.zh-CN.md)

A [pi](https://github.com/earendil-works/pi-coding-agent) extension for system-prompt experiments: `/purge` switches which system prompt a session runs with — pi's stock prompt, a trimmed variant, or only your own prompt file.

It is meant for prompt engineering work: comparing how the same request behaves when the harness prompt is present, trimmed, or absent; regression-testing your own instructions; and studying instruction-following and prompt-injection robustness under controlled conditions.

With it off, nothing changes — no prompt rewrite, no disk reads. pi behaves exactly as if the extension were not installed.

## Install

```bash
pi install npm:pi-purge
```

Point it at a prompt file and pick a mode:

```text
/purge source C:/prompts/my-instructions.md
/purge mode replace
/purge on
```

## Commands

| Command | Effect |
| --- | --- |
| `/purge` | Toggle on/off |
| `/purge on` / `off` | Enable or disable the rewrite |
| `/purge status` | Mode, source file, loaded size, and what the previous turn actually changed |
| `/purge reload` | Re-read the source file after editing it |
| `/purge mode append\|replace\|strict` | Switch composition mode |
| `/purge source <path>` | Change the prompt file; a failed switch rolls back to the previous file |

## Modes

| Mode | System prompt sent to the model | Use it when |
| --- | --- | --- |
| `append` | Your file prepended to pi's prompt, unchanged. | You want a control run: baseline behavior plus your instructions on top. |
| `replace` | Your file, then pi's prompt with its built-in assistant identity line and bundled documentation section removed. Tool list, guidelines, and project context stay. | You want to measure the effect of the harness framing without losing tool context. |
| `strict` | Your file plus `Current working directory: …` only. | You want to isolate your instructions as a single variable. |

`replace` finds both sections by exact wording. If a pi update rewords them, it leaves the prompt intact rather than cutting the wrong text — `/purge status` then reports `身份段 未匹配` (identity line not found) and behavior falls back to `append`.

Tool schemas are passed through the API `tools` parameter rather than the system prompt, so tools keep working in every mode.

## State and defaults

- State file: `<agent dir>/pi-purge.json`, holding `{"enabled": boolean, "source": string, "mode": "append"|"replace"|"strict"}`. `<agent dir>` is `$PI_CODING_AGENT_DIR`, defaulting to `~/.pi/agent`.
- Default source: `<agent dir>/purge.md` when present, otherwise `~/.dsh/prompt-inject.md`. Override it with `/purge source <path>`.

## Notes for experiments

- `strict` also drops `AGENTS.md` / project context, the skills list, and prompt text injected by other extensions. That is what makes it a clean single-variable setup, and also what makes results from `strict` not comparable to a normal session.
- `append` is the least invasive mode and usually the weakest signal: later sections of the harness prompt still carry a lot of weight, so differences can be small.
- Extension load order affects what `before_agent_start` sees. Prefer recording `/purge status` output alongside any results you keep.

## Development

```bash
npm test   # assertion suite over a temporary agent dir; never touches your real config
```

The extension registers a `before_agent_start` hook that returns a replacement system prompt, plus a `/purge` command. No other hooks, no background work.

## License

MIT
