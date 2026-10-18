# pi-purge

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that puts the system prompt behind a switch: `/purge on` strips pi's built-in assistant identity and docs from the system prompt, then puts your own persona file at the top of it.

`/purge off` changes nothing at all — no prompt rewrite, no disk reads. With it off, pi behaves exactly as if the extension were not installed.

## Install

```bash
pi install npm:pi-purge
```

Then point it at a prompt file and turn it on:

```text
/purge source C:/prompts/my-persona.md
/purge mode strict
/purge on
```

## Commands

| Command | Effect |
| --- | --- |
| `/purge` | Toggle on/off |
| `/purge on` / `off` | Turn the rewrite on or off |
| `/purge status` | Show mode, source file, loaded size, and what the last turn actually cut |
| `/purge reload` | Re-read the source file (after editing it) |
| `/purge mode strict\|replace\|append` | Switch rewrite mode |
| `/purge source <path>` | Change the persona file; a failed switch rolls back to the previous file |

## Modes

| Mode | System prompt sent to the model |
| --- | --- |
| `strict` | Your persona + `Current working directory: …` only. Everything else that pi built is dropped. |
| `replace` | Your persona on top, then pi's prompt with the `You are an expert coding assistant…` identity sentence and the `Pi documentation (…)` section removed. |
| `append` | Your persona on top, pi's prompt untouched. |

`replace` locates both sections by their exact wording. If a pi upgrade rewords them, it leaves the prompt intact and degrades to `append` instead of cutting the wrong text — `/purge status` reports `身份段 未匹配` (identity not matched) in that case.

`append` is the least invasive and the least effective: on some models the assistant still answers in pi's coding-assistant voice because later sections of the host prompt dominate. `strict` is the one that reliably changes the persona.

## State and defaults

- State file: `<agent dir>/pi-purge.json` (`{"enabled": boolean, "source": string, "mode": "strict"|"replace"|"append"}`). `<agent dir>` is `$PI_CODING_AGENT_DIR`, or `~/.pi/agent`.
- Default source: `<agent dir>/purge.md` if present, otherwise `~/.dsh/prompt-inject.md`.
- Tool schemas are passed through the API `tools` parameter, not the system prompt, so tools keep working in `strict` mode.

## Costs of `strict`

`strict` drops everything else pi would have told the model: `AGENTS.md` / project context, the skills list, and prompt text injected by other extensions. That is deliberate — it is the only mode observed to reliably override the persona — but it means project instructions stop reaching the model while it is on.

## Development

```bash
npm test   # runs the assertion suite against a temp agent dir, never your real config
```

## License

MIT
