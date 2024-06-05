# Fix Require Modules

This is a plugin for [Obsidian](https://obsidian.md/) that fixes `require()` calls for some built-in modules.

Those built-in modules are available for import during the Plugin development but shows `Uncaught Error: Cannot find module` error if you try to `require()` them from the [DevTools Console], [Templater] scripts, [dataviewjs] scripts etc.

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

## Usage

You can use it in [DevTools Console], [Templater] scripts, [dataviewjs] scripts, etc

```js
const obsidian = require("obsidian");
new obsidian.Notice("My notice");
```

Or

```js
const { Notice } = require("obsidian");
new Notice("My notice");
```

You can get the list of built-in module names, fixed by this plugin:

```js
app.plugins.getPlugin("fix-require-modules").builtInModuleNames
```

## License

 © [Michael Naumov](https://github.com/mnaoumov/)

[DevTools Console]: https://developer.chrome.com/docs/devtools/console

[Templater]: https://silentvoid13.github.io/Templater/

[dataviewjs]: https://blacksmithgu.github.io/obsidian-dataview/api/intro/
