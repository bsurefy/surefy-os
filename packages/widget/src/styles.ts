// SPDX-License-Identifier: MIT

// The widget's own tokens, matching the workspace's neutral palette (packages/ui semantic tokens).
// They live on the shadow host, so the page cannot change them and they cannot leak out.
const LIGHT = `
  --sw-surface: #ffffff;
  --sw-surface-2: #eff2f3;
  --sw-border: #e1e6e8;
  --sw-foreground: #121a1e;
  --sw-muted: #5f6b72;
  --sw-primary: #0e6b76;
  --sw-primary-hover: #0a5962;
  --sw-primary-foreground: #ffffff;
  --sw-visitor: #e2f0f1;
  --sw-visitor-foreground: #0a5962;
  --sw-ring: #0e6b76;
  --sw-danger-soft: #fbe7e5;
  --sw-danger-foreground: #9a2622;
  --sw-warning-soft: #fcf0da;
  --sw-warning-foreground: #8a5000;
  --sw-shadow: 0 12px 32px rgb(13 18 20 / 0.18), 0 2px 6px rgb(13 18 20 / 0.12);
`

const DARK = `
  --sw-surface: #141b1e;
  --sw-surface-2: #1b2427;
  --sw-border: #263136;
  --sw-foreground: #e8eef0;
  --sw-muted: #8a979d;
  --sw-primary: #3fb0bc;
  --sw-primary-hover: #62c3cd;
  --sw-primary-foreground: #04201f;
  --sw-visitor: #11323a;
  --sw-visitor-foreground: #86d3db;
  --sw-ring: #3fb0bc;
  --sw-danger-soft: #3a1816;
  --sw-danger-foreground: #f6a39b;
  --sw-warning-soft: #34270e;
  --sw-warning-foreground: #f0c072;
  --sw-shadow: 0 12px 32px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.4);
`

export const STYLES = `
:host { all: initial; }
:host([data-theme='light']) { ${LIGHT} }
:host([data-theme='dark']) { ${DARK} }
:host([data-theme='auto']) { ${LIGHT} }
@media (prefers-color-scheme: dark) { :host([data-theme='auto']) { ${DARK} } }

.root {
  position: fixed; bottom: 20px; z-index: 2147483000;
  font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--sw-foreground);
  -webkit-font-smoothing: antialiased;
}
.root[data-position='bottom_right'] { right: 20px; }
.root[data-position='bottom_left'] { left: 20px; }
.root *, .root *::before, .root *::after { box-sizing: border-box; }

button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, textarea:focus-visible, a:focus-visible {
  outline: 2px solid var(--sw-ring); outline-offset: 2px;
}

.launcher {
  width: 56px; height: 56px; border-radius: 50%; border: 0;
  background: var(--sw-primary); color: var(--sw-primary-foreground);
  box-shadow: var(--sw-shadow);
  display: grid; place-items: center;
}
.launcher:hover { background: var(--sw-primary-hover); }
.launcher svg { width: 26px; height: 26px; }

.panel {
  position: absolute; bottom: 72px; width: 380px; height: min(600px, calc(100vh - 112px));
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--sw-surface); border: 1px solid var(--sw-border); border-radius: 16px;
  box-shadow: var(--sw-shadow);
  animation: sw-open 160ms ease-out;
}
.root[data-position='bottom_right'] .panel { right: 0; }
.root[data-position='bottom_left'] .panel { left: 0; }
.panel[hidden] { display: none; }
@keyframes sw-open { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.header {
  display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 16px;
  border-bottom: 1px solid var(--sw-border);
}
.title { flex: 1; margin: 0; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon-button {
  width: 44px; height: 44px; border: 0; border-radius: 10px; background: transparent;
  display: grid; place-items: center; color: var(--sw-muted);
}
.icon-button:hover { background: var(--sw-surface-2); color: var(--sw-foreground); }
.icon-button svg { width: 18px; height: 18px; }

.messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.greeting { margin: 0; color: var(--sw-foreground); }
.starters { display: flex; flex-wrap: wrap; gap: 8px; }
.starter {
  min-height: 44px; padding: 8px 12px; border-radius: 12px; text-align: left;
  border: 1px solid var(--sw-border); background: var(--sw-surface);
}
.starter:hover { background: var(--sw-surface-2); }

.bubble { max-width: 85%; padding: 8px 12px; border-radius: 14px; overflow-wrap: anywhere; }
.bubble.visitor { align-self: flex-end; background: var(--sw-visitor); color: var(--sw-visitor-foreground); border-bottom-right-radius: 4px; }
.bubble.answer { align-self: flex-start; background: var(--sw-surface-2); border-bottom-left-radius: 4px; }
.bubble a { color: var(--sw-primary); }
.sources { margin: 8px 0 0; padding: 8px 0 0; border-top: 1px solid var(--sw-border); list-style: none; font-size: 12px; color: var(--sw-muted); }
.sources-title { font-weight: 600; margin-bottom: 2px; }
.note { padding: 8px 12px; border-radius: 10px; font-size: 13px; }
.note.warning { background: var(--sw-warning-soft); color: var(--sw-warning-foreground); }
.note.danger { background: var(--sw-danger-soft); color: var(--sw-danger-foreground); }
.retry { margin-left: 8px; min-height: 32px; padding: 2px 10px; border-radius: 8px; border: 1px solid currentColor; background: transparent; }

.dots { display: inline-flex; gap: 4px; padding: 4px 0; }
.dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--sw-muted); animation: sw-dot 1s infinite ease-in-out; }
.dots span:nth-child(2) { animation-delay: 150ms; }
.dots span:nth-child(3) { animation-delay: 300ms; }
@keyframes sw-dot { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }

.composer { display: flex; align-items: flex-end; gap: 8px; padding: 8px 12px 4px; border-top: 1px solid var(--sw-border); }
.composer textarea {
  flex: 1; resize: none; max-height: 120px; min-height: 44px; padding: 11px 12px;
  font: inherit; color: var(--sw-foreground); background: var(--sw-surface);
  border: 1px solid var(--sw-border); border-radius: 12px;
}
.send {
  width: 44px; height: 44px; border: 0; border-radius: 12px;
  background: var(--sw-primary); color: var(--sw-primary-foreground); display: grid; place-items: center;
}
.send:disabled { opacity: 0.5; cursor: not-allowed; }
.send svg { width: 18px; height: 18px; }
.disclaimer { margin: 0; padding: 0 12px 8px; font-size: 11px; color: var(--sw-muted); text-align: center; }
.status { padding: 24px 16px; text-align: center; color: var(--sw-muted); }

.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

@media (max-width: 479px) {
  .root[data-open='true'] .panel {
    position: fixed; inset: 0; width: 100vw; height: 100dvh; border-radius: 0; border: 0;
  }
  .root[data-open='true'] .launcher { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .panel { animation: none; }
  .dots span { animation: none; opacity: 0.6; }
}
`
