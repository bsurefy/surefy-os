// SPDX-License-Identifier: MIT
import { boot, findScript } from './boot.js'

// The bundle's entry. It exports nothing, so the script defines no global of its own besides
// `window.SurefyWidget`. `document.currentScript` is only set while the script first runs.
const script = findScript()
if (script?.dataset.token) boot(script)
