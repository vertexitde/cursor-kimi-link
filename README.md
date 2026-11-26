# cursor-kimi-link

An experimental patch that adds the models of your Kimi Code membership to Cursor: **K3.1 Pro**, K3.1 Pro Highspeed, K3, K3-256k, K2.8 Preview, K2.7 Code Highspeed, and whatever else the Kimi Code CLI offers your account. The models are run by Moonshot's official Kimi Code CLI over the Agent Client Protocol (`kimi acp`), the interface Kimi offers to editors such as Zed and JetBrains, signed in with your own account. Cursor keeps its agent harness, tools and approval controls. No extension is installed.

Companion projects: [cursor-gpt-link](https://github.com/vertexitde/cursor-gpt-link), [cursor-claude-link](https://github.com/vertexitde/cursor-claude-link), [cursor-mercury-link](https://github.com/vertexitde/cursor-mercury-link) and [cursor-gemini-link](https://github.com/vertexitde/cursor-gemini-link). All five can be installed together.

## Status

| Item | Current status |
| --- | --- |
| Client platform | Windows x64 |
| Supported Cursor | 3.32.7, commit `c83fdd301426f2280908a553e0782475a1db4af0`; 3.32.5, commit `94cda5961505b3ddb751f861e6eb5f2e65379db0`; 3.32.4, commit `0925c4b8226c56947c43f0b555fb98e187a7e020`; 3.32.1, commit `ac14a3354228b109d5c406520b0f946a9954afd0`; 3.31.17, commit `0c888adc18cbde5c1f61c0debd304de2cdaf23a0`; 3.31.12, commit `61ea52f088708259885abd9a37eafec994cd5db0`; 3.25.9, commit `5d4df965746c5d09740842fc0f1331ba1c157830`; 3.24.12, commit `37b865941ccb31e2fc90c685157534efca87f960` |
| Kimi Code CLI | 2.7.0, signed in with `kimi login` (kimi.ai account) |
| Through ACP, verified live on November 20, 2026 | K3.1 Pro: structured tool calls, a full tool round trip, image input |
| Automated checks | Unit tests, and Cursor's extracted code with the patch applied on the original 3.32.7, 3.32.5, 3.32.4, 3.32.1, 3.31.17, 3.31.12, 3.25.9 and 3.24.12 bundles and on top of the four companions |
| In-app use | Not yet confirmed in the Cursor UI |

## What it adds

**Kimi Code** appears as its own section in the model picker, below the companion sections when those are installed. Each model carries the Kimi mark and offers **Thinking** with the levels Kimi lists for it: Low, High and Max for most models, On and Max for K2.7 Code Highspeed. The default is the one set in Kimi's own configuration. Context windows come from Kimi's `config.toml`: 1M for K3.1 Pro, K3 and K2.8 Preview, 256K for K3-256k and K2.7 Code Highspeed.

There is nothing to configure in Cursor: the Kimi Code CLI uses your Kimi sign-in.

### In Cursor's agent harness

- **Tools**: Cursor's tools are offered to the model, and the model's tool calls come back to Cursor, which runs them under its own approvals. Every Kimi session runs in Kimi's Default mode, where its own tools need an approval, in an empty private folder, and the bridge refuses every permission request Kimi might send. (Plan mode did the same job, but the models then refused Cursor's edits "because Plan mode is active".)
- **Images**: pasted images go to Kimi as ACP image blocks.
- **Subagents, queued follow-ups, Plan to Build, Max mode and context** use the same handling as the companion patches.

### Limits

- Each turn is one Kimi session. Thinking and the reply stream while Kimi writes them: the reply is read out of its JSON answer as it arrives; tool calls follow once the answer is complete.
- ACP has no option to force a JSON answer. Kimi is instructed to answer with `{text, tool_calls}`; the bridge checks every answer strictly against the tools Cursor offered and asks once more when it does not parse.
- ACP reports no token counts. The bridge estimates them from the text length, so context usage in Cursor is approximate.
- The Highspeed variants count more against your Kimi Code quota, and Max thinking takes longest.
- Kimi's documentation does not say whether using the membership from another program over ACP is permitted. ACP is Kimi's documented interface for editors, and this project never touches Kimi credentials; it only starts the official CLI. Use it at your own discretion.

## Requirements

- Windows x64 and a supported Cursor build.
- Node.js 22 or newer on PATH.
- The Kimi Code CLI, signed in once: `kimi login` (add `--region global` for kimi.ai accounts, for example with Google sign-in).
- Permission to modify the Cursor installation.

There are no npm dependencies.

## Install

Close Cursor. If you use the companion patches, install them first: ChatGPT, Claude, Mercury, Gemini, then Kimi.

```powershell
git clone https://github.com/vertexitde/cursor-kimi-link.git
cd cursor-kimi-link
npm test
npm run check
npm run install:patch
```

`check` asks Kimi for your models, then verifies the Cursor version, commit, original file hashes (or matching companion installations), unique patch anchors and JavaScript syntax without writing anything.

## Remove

Close Cursor and remove Kimi **before** removing any companion patch, because all five modify the same files:

```powershell
npm run restore
```

## Remote sessions

As with the companions, a Remote-SSH window runs the agent on the host, and the installer adds a reverse forward for port `43191` to the shared block in `~/.ssh/config`. The Kimi Code CLI keeps running on this machine. `npm run install:remote -- <host>` carries the runtime repairs to a host, and hosts that already have them are updated by every local install. The links can be installed on a host in any order; `--restore --all-links` restores the original files for all of them at once.

## After a Cursor update

A Cursor update replaces the patched files and the installer refuses unknown builds. A new build is supported by its reviewed `build-<version>.json` and `symbols-<version>.json`:

```powershell
node scripts/derive-symbols.mjs <path to original resources/app>
node scripts/verify-build.mjs --original <original resources/app> --combined <resources/app with companions installed> [--version <build>]
```

Then remove the stale `installed.json` and reinstall in order: ChatGPT, Claude, Mercury, Gemini, Kimi.

## How it works

- A local bridge listens on `127.0.0.1:43191` and starts with Cursor. It requires a random per-installation key and speaks OpenAI chat completions to Cursor's local agent runtime.
- For every request the bridge starts `kimi acp` in a new empty folder, opens a session, sets Default mode, the model and the thinking level, and sends one prompt: the agent instructions, the conversation and Cursor's tool definitions as JSON, plus any images.
- Kimi's reply is read from the streamed message chunks, parsed as `{text, tool_calls}`, checked against the tools Cursor offered and returned in OpenAI form, streamed or not. The session is deleted afterwards.
- In the workbench, the patch adds the models, routes them through the local runtime, and joins the shared picker, queue, stop and subagent handling that the companion patches install.

## Security

The bridge accepts connections from the local machine only and rejects requests without its installation key. `config.json` contains that key; do not share it. This project does not read, store or forward Kimi credentials; it reads only model sizes and default levels from Kimi's `config.toml`. See [testing notes](docs/testing.md) for what was verified.

## License

MIT. Cursor is a trademark of Anysphere. Kimi and Moonshot are trademarks of Moonshot AI. The Kimi icon is from LobeHub Icons (MIT); see [third-party notices](THIRD_PARTY_NOTICES.md). This project is not affiliated with any of them.
