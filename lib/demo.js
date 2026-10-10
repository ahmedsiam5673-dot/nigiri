'use strict';
/** A scripted fake agent session so the island can be tried without any agent or API key. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createDemo(core) {
  let run = 0;
  const cwd = 'C:\\demo\\sunny-app';
  const base = { session_id: 'demo', cwd };

  async function start() {
    const me = ++run;
    const alive = () => me === run;
    const fire = (evt, opts) => core.handle({ ...base, ...evt }, { agent: 'demo', ...opts });

    await fire({ hook_event_name: 'SessionStart' });
    await sleep(900);
    if (!alive()) return;
    await fire({ hook_event_name: 'UserPromptSubmit', prompt: 'Add a dark mode toggle' });
    const steps = [
      ['Read', { file_path: 'C:\\demo\\sunny-app\\src\\theme.css' }],
      ['Read', { file_path: 'C:\\demo\\sunny-app\\src\\App.tsx' }],
      ['Edit', { file_path: 'C:\\demo\\sunny-app\\src\\theme.css' }],
      ['Edit', { file_path: 'C:\\demo\\sunny-app\\src\\App.tsx' }]
    ];
    for (const [tool, input] of steps) {
      await sleep(1300);
      if (!alive()) return;
      await fire({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input });
    }
    await sleep(1200);
    if (!alive()) return;
    const pending = fire({
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: 'npm test -- --watchAll=false', description: 'Run the test suite' }
    });
    const answer = await pending;
    if (!alive()) return;
    const behavior = answer && answer.hookSpecificOutput && answer.hookSpecificOutput.decision && answer.hookSpecificOutput.decision.behavior;
    if (behavior === 'deny') {
      await fire({ hook_event_name: 'Notification', message: 'Okay, skipping the tests' });
    } else {
      await fire({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Running tests' } });
      await sleep(1800);
      if (!alive()) return;
    }
    await fire({ hook_event_name: 'Stop' });
    await sleep(6000);
    if (alive()) await fire({ hook_event_name: 'SessionEnd' });
  }

  return {
    start() {
      start().catch(() => {});
    },
    stop() {
      run++;
    }
  };
}

module.exports = { createDemo };
