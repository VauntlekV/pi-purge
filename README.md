# pi-purge

[English](README.md) | [中文](README.zh-CN.md)

A [pi](https://github.com/earendil-works/pi-coding-agent) extension for system-prompt experiments: `/purge` switches which system prompt a session runs with — pi's stock prompt, a trimmed variant, or only a persona prompt.

It is meant for prompt engineering work: comparing how the same request behaves when the harness prompt is present, trimmed, or absent; regression-testing your own instructions; and studying instruction-following and prompt-injection robustness under controlled conditions.

With it off, nothing changes — no prompt rewrite, no disk reads. pi behaves exactly as if the extension were not installed.

## Install

```bash
pi install npm:pi-purge
```

Then, inside a session:

```text
/purge
```

That is all. A default persona ships inside the package; no prompt file is needed.

To use your own prompt instead:

```text
/purge source C:/prompts/my-instructions.md
/purge mode replace
/purge on
```

`/purge source embedded` switches back to the bundled persona.

## Commands

| Command | Effect |
| --- | --- |
| `/purge` | Toggle on/off for this session |
| `/purge on` / `off` | Enable or disable the rewrite |
| `/purge status` | Mode, prompt source, loaded size, and what the previous turn actually changed |
| `/purge mode append\|replace\|strict` | Switch composition mode (default `strict`) |
| `/purge source <path\|embedded>` | Change the prompt file, or go back to the bundled persona; a failed switch rolls back |
| `/purge reload` | Re-read an external prompt file after editing it |

## Modes

| Mode | System prompt sent to the model | Use it when |
| --- | --- | --- |
| `append` | Your prompt prepended to pi's prompt, unchanged. | You want a control run: baseline behavior plus your instructions on top. |
| `replace` | Your prompt, then pi's prompt with its built-in assistant identity line and bundled documentation section removed. Tool list, guidelines, and project context stay. | You want to measure the effect of the harness framing without losing tool context. |
| `strict` | Your prompt plus `Current working directory: …` only. | You want to isolate your instructions as a single variable. This is the default. |

`replace` finds both sections by exact wording. If a pi update rewords them, it leaves the prompt intact rather than cutting the wrong text — `/purge status` then reports `身份段 未匹配` (identity line not found) and behavior falls back to `append`. `strict` does no matching at all, so it behaves the same across pi versions.

Tool schemas are passed through the API `tools` parameter rather than the system prompt, so tools keep working in every mode, including `strict`.

## Session scope and defaults

- Scope is the session. Every `session_start` — startup, `new`, `resume`, `reload` — begins **disabled**. Quitting pi always returns to stock behavior.
- Nothing is written to disk: there is no state file, no cache, no marker. Two pi processes cannot affect each other.
- The default prompt is the persona bundled inside `extensions/pi-purge.ts`. `/purge source <path>` points at your own file; `/purge source embedded` comes back.
- The default mode is `strict`.

## Upgrading from 0.1.x

0.2 no longer writes or reads `pi-purge.json`, and it no longer auto-detects a prompt file — the persona is bundled and the mode defaults to `strict`.

- Delete `<agent dir>/pi-purge.json`; it is ignored from now on.
- Enabling is per session: after a restart or `/resume`, run `/purge` again.
- `append` and `replace` are unchanged if you need them.

## Notes for experiments

- `strict` also drops `AGENTS.md` / project context, the skills list, and prompt text injected by other extensions. That is what makes it a clean single-variable setup, and also what makes results from `strict` not comparable to a normal session.
- `append` is the least invasive mode and usually the weakest signal: later sections of the harness prompt still carry a lot of weight, so differences can be small.
- `replace` still leaves harness text behind, and other extensions may append their own prompt sections after this one runs. In practice `strict` is the only mode where the persona is not competing with other framing.
- Extension load order affects what `before_agent_start` sees. Prefer recording `/purge status` output alongside any results you keep.

## Development

```bash
npm test   # 9 assertion groups; runs against a temporary agent dir and asserts nothing is written
```

The extension registers one `before_agent_start` hook, one `session_start` hook, and a `/purge` command. No other hooks, no background work, no file writes.

## License

MIT
