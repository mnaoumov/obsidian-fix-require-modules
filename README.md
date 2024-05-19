# Fix Require Modules

This is a plugin for [Obsidian](https://obsidian.md/) that fixes `require()` calls for some built-in modules.

Those built-in modules are available for import during the Plugin development but shows `Uncaught Error: Cannot find module` error if you try to `require()` them from the `DevTools Console`, `Templater` scripts, `dataviewjs` scripts etc.

The current plugin fixes this problem and make the following `require()` calls working properly.

```js
require("obsidian");
require("@codemirror/autocomplete");
require("@codemirror/collab");
require("@codemirror/commands");
require("@codemirror/language");
require("@codemirror/lint");
require("@codemirror/search");
require("@codemirror/state");
require("@codemirror/text");
require("@codemirror/view");
require("@lezer/common");
require("@lezer/lr");
require("@lezer/highlight");
```

## Installation

- `Fix Require Modules` is available on [the official Community Plugins repository](https://obsidian.md/plugins) now.
- Beta releases can be installed through [BRAT](https://github.com/TfTHacker/obsidian42-brat)

## License

 © [Michael Naumov](https://github.com/mnaoumov/)
