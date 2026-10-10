# Nigiri (Windows)

A tiny glass island at the top of your screen with a little mascot. It watches your
AI coding agent (Claude Code), lets you Allow or Deny its requests, and has a chat
with Anthropic, OpenAI, Google AI, Ollama and LM Studio.

## Get the .exe without installing anything (GitHub Actions)
1. Create a GitHub repo and upload everything in this folder (keep the hidden `.github` folder).
2. Open the **Actions** tab, run **Build Windows exe** (it also runs on every push).
3. When it finishes, open the run and download the **Nigiri-portable** artifact. Unzip it and double-click the .exe.
   Windows SmartScreen may warn the first time: **More info > Run anyway**.

## Run from source (needs Node.js)
    npm install
    npm start

## Using it
- Click the small pill to open it. **Esc** or clicking elsewhere closes it. **Ctrl+Alt+N** shows or hides it from anywhere.
- Settings > **Connect Claude Code** adds hooks to `~/.claude/settings.json` (a backup is kept next to it).
  Restart Claude Code sessions that were already open. Nigiri must be running for approvals to appear;
  when it is not running, Claude Code just works as usual.
- Settings > AI providers: paste a key (encrypted with Windows). Ollama and LM Studio need no key.
- Settings > **Start the demo** plays a pretend agent session.
- The tray icon (bottom right) has Open, Settings, Demo and Quit.

## Notes
- Hooks talk to `http://127.0.0.1:47821` only, protected by a random token stored on your PC.
- The mascot design is original. This project is not affiliated with Coucou.
