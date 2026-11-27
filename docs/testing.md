# Testing notes

Updated on November 20, 2026.

## Environment

| Component | Version |
| --- | --- |
| Operating system | Windows 11, x64 |
| Cursor | 3.32.11, commit `79af92cc6796bb44603d7c96f7c88e4f3edafcb0` (also reviewed: 3.32.7, 3.32.5, 3.32.4, 3.32.1, 3.31.17, 3.31.12, 3.25.9 and 3.24.12) |
| Kimi Code CLI | 2.7.0, kimi.ai account, Kimi Code membership |
| Node.js | 26.12.1 |
| Companion patches | cursor-gpt-link, cursor-claude-link, cursor-mercury-link and cursor-gemini-link for the same build |

## Why ACP

- `kimi -p` takes the prompt only as a command-line argument. Windows limits a command line to about 32,000 characters, which a Cursor agent prompt with its tool definitions exceeds.
- The Kimi Code membership signs in with OAuth; Kimi documents no API key for using the membership from other programs.
- `kimi acp` is Kimi's documented interface for editors. It reads JSON-RPC from stdin with no size limit and accepts images as content blocks.

## Kimi Code CLI over ACP, verified live

| Check | Result |
| --- | --- |
| `initialize` | `promptCapabilities.image: true`, sessions can be listed, resumed, closed and deleted |
| `session/new` | Config options `model` (6 models), `thinking` and `mode` (Default, Plan, Auto, YOLO) |
| Thinking per model | Low, High, Max; K2.7 Code Highspeed On and Max |
| Plan mode | "Read-only planning; no tool execution"; no tool call or permission request was seen in any test |
| Tool call | K3.1 Pro at Low asked for `read_file` with `{"path":"package.json"}` in about 6 seconds |
| Tool round trip | It then answered from the tool result in about 4.5 seconds |
| Image | A blue test image sent as an ACP image block was named "Blau" |
| Thinking | Streamed separately as `agent_thought_chunk` |
| Token usage | Not reported by ACP; the bridge estimates it |
| Login | `kimi login --region global` for kimi.ai accounts; Kimi Code's move from `~/.kimi` to `~/.kimi-code` does not carry the credentials over |

## Automated checks

`npm test` covers the request conversion, image blocks, answer rules, JSON extraction and validation, a scripted `kimi acp` (Plan mode, model and thinking, the refused permission request, the correction round, session deletion, folder cleanup), model discovery, the picker and provider catalogs, the five-provider picker helper in the compiled and list forms, the runtime thinking branch and Max mode.

`scripts/verify-build.mjs` patches Cursor's original bundles and runs the extracted Cursor code with the patch in place.

| Build | Standalone | Combined with the four companions |
| --- | --- | --- |
| 3.32.11 | Passes | Passes |
| 3.32.7 | Passes | Passes |
| 3.32.5 | Passes | Passes |
| 3.32.4 | Passes | Passes |
| 3.32.1 | Passes | Passes |
| 3.31.17 | Passes | Passes |
| 3.31.12 | Passes | Passes |
| 3.25.9 | Passes | Not run |
| 3.24.12 | Passes | Not run |

Not yet confirmed: a turn in the Cursor UI and a remote session.
