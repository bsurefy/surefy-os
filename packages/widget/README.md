# @surefy/widget

The website chat for agents published on SurefyOS: one script tag, no framework, MIT-licensed.

```html
<script src="https://api.example.com/widget/v1/widget.js" data-token="wt_…" async></script>
```

Copy the snippet with your token from the agent's **Publish** tab in SurefyOS. The page's origin must be one of the widget's allowed origins.

| Attribute      | Meaning                                                       |
| -------------- | ------------------------------------------------------------- |
| `data-token`   | The widget token (required)                                   |
| `data-api-url` | Another API address; by default the script's own origin       |
| `data-open`    | `true` opens the chat when the page loads                     |
| `data-locale`  | The widget's language; by default the organization's language |

Your own buttons can call `window.SurefyWidget.open()`, `.close()` and `.toggle()`.

The widget draws inside a Shadow DOM, so your page's styles do not change it. The conversation stays in the visitor's browser tab.

## Development

```bash
pnpm --filter @surefy/widget build   # dist/widget.js
pnpm --filter @surefy/widget test
```

The widget takes only types from `@surefy/contracts`; CI rejects any runtime import from another SurefyOS package.
