# Fix Require Modules

This is a plugin for [Obsidian](https://obsidian.md/) that fixes `require()` calls for

- Built-in modules.
- Relative modules.
- [`ECMAScript Modules` (`ES Modules`, `ESM`)][ESM].
- [`TypeScript`][TypeScript] modules.

## Built-in modules

Those built-in modules are available for import during the Plugin development but shows `Uncaught Error: Cannot find module` error if you try to `require()` them from the [DevTools Console], [Templater] scripts, [dataviewjs] scripts etc.

The plugin fixes that problem and makes the following `require()` calls working properly:

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

## Relative modules

Originally `require()` would throw `Cannot find module` error for:

```js
require("./some/relative/path.js");
```

The plugin fixes that problem.

## [`ECMAScript Modules`][ESM]

Originally `require` function supported only `CommonJS` (`cjs`) modules and would throw `require() of ES Module path/to/script.mjs not supported. Instead change the require of path/to/script.mjs to a dynamic import() which is available in all CommonJS modules` error for:

```js
require("path/to/script.mjs");
```

The plugin fixes that problem.

## [`TypeScript`][TypeScript] modules

Originally `require` function was built to support only `JavaScript` modules. The plugin adds support for `TypeScript` modules:

```js
require("path/to/script.ts");
require("path/to/script.cts");
require("path/to/script.mts");
```

## Installation

- `Fix Require Modules` is available on [the official Community Plugins repository](https://obsidian.md/plugins) now.
- Beta releases can be installed through [BRAT](https://github.com/TfTHacker/obsidian42-brat)

## Usage

- You can use it in [DevTools Console], [Templater] scripts, [dataviewjs] scripts, etc

```js
const obsidian = require("obsidian");
new obsidian.Notice("My notice");

const { Notice } = require("obsidian");
new Notice("My notice");
```

- You can get the list of built-in module names, fixed by the plugin:

```js
app.plugins.getPlugin("fix-require-modules").builtInModuleNames
```

- For relative and vault-root paths, you can optionally provide the path to the current script/note, if the plugin couldn't detect it. Feel free to submit an [issue](https://github.com/mnaoumov/obsidian-fix-require-modules/issues) in that case.

```js
require("./some/relative/path.js");
require("../some/other/relative/path.js");
require("/vault/root/path.js");
require("./some/relative/path.js", "path/to/current/script.js");
require("./some/relative/path.js", "path/to/current/note.md");
```

## License

 © [Michael Naumov](https://github.com/mnaoumov/)

[DevTools Console]: https://developer.chrome.com/docs/devtools/console

[Templater]: https://silentvoid13.github.io/Templater/

[dataviewjs]: https://blacksmithgu.github.io/obsidian-dataview/api/intro/

[ESM]: https://nodejs.org/api/esm.html

[TypeScript]: https://www.typescriptlang.org/
