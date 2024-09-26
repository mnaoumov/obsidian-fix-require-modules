# Fix Require Modules

This is a plugin for [`Obsidian`][Obsidian] that fixes [`require()`][require] calls and simplifies working with custom [`JavaScript`][JavaScript]/[`TypeScript`][TypeScript] modules.

## Features

This plugin heavily simplifies working with custom [`JavaScript`][JavaScript]/[`TypeScript`][TypeScript] modules. You can work with them using [DevTools Console](https://developer.chrome.com/docs/devtools/console), [CustomJS](https://github.com/saml-dev/obsidian-custom-js) scripts, [dataviewjs](https://blacksmithgu.github.io/obsidian-dataview/api/intro/) scripts, [Modules](https://github.com/polyipseity/obsidian-modules) scripts, [QuickAdd](https://quickadd.obsidian.guide/) scripts, [Templater](https://silentvoid13.github.io/Templater/) scripts, etc.

### Built-in Modules

Certain built-in modules are available for import during plugin development but show `Uncaught Error: Cannot find module` if you try to [`require()`][require] them manually. This plugin fixes that problem, allowing the following [`require()`][require] calls to work properly:

```js
require('obsidian');
require('@codemirror/autocomplete');
require('@codemirror/collab');
require('@codemirror/commands');
require('@codemirror/language');
require('@codemirror/lint');
require('@codemirror/search');
require('@codemirror/state');
require('@codemirror/text');
require('@codemirror/view');
require('@lezer/common');
require('@lezer/lr');
require('@lezer/highlight');
```

Example usage:

```js
const obsidian = require('obsidian');
new obsidian.Notice('My notice');

const { Notice } = require('obsidian');
new Notice('My notice');
```

Get the list of built-in module names fixed by the plugin:

```js
app.plugins.getPlugin('fix-require-modules').builtInModuleNames;
```

### `obsidian/app` module

There is a global variable `app` that gives access to obsidian `App` instance.

However, starting from Obsidian [`v1.3.5`](https://github.com/obsidianmd/obsidian-api/commit/7646586acccf76f877b64111b2398938acc1d53e#diff-0eaea5db2513fdc5fe65d534d3591db5b577fe376925187c8a624124632b7466R4708) this global variable is deprecated in the public API.

Starting from Obsidian [`v1.6.6`](https://github.com/obsidianmd/obsidian-api/commit/f20b17e38ccf12a8d7f62231255cb0608436dfbf#diff-0eaea5db2513fdc5fe65d534d3591db5b577fe376925187c8a624124632b7466L4950-L4959) this global variable was completely removed from the public API.

Currently this global variable is still available, but it's better not rely on it, as it is not guaranteed to be maintained.

This plugin gives you a safer alternative:

```js
require('obsidian/app');
```

### Relative Modules

Fixes `Cannot find module` errors for relative paths:

```js
require('./some/relative/path.js');
require('../some/other/relative/path.js');
```

Optionally provide the path to the current script/note if detection fails. Submit an [issue](https://github.com/mnaoumov/obsidian-fix-require-modules/issues) if needed:

```js
require('./some/relative/path.js', 'path/to/current/script.js');
require('./some/relative/path.js', 'path/to/current/note.md');
```

### Root-relative Modules

Adds support for root-relative paths:

```js
require('/path/from/root.js');
```

The root `/` directory is configurable via settings.

### Vault-root-relative Modules

Adds support for vault-root-relative paths:

```js
require('//path/from/vault/root.js');
```

### [`ECMAScript Modules` (`esm`)](https://nodejs.org/api/esm.html)

Originally, [`require()`][require] only supported [`CommonJS` (`cjs`)](https://nodejs.org/api/modules.html#modules-commonjs-modules) modules and would throw `require() of ES Module path/to/script.mjs not supported. Instead change the require of path/to/script.mjs to a dynamic import() which is available in all CommonJS modules`. This plugin adds support for ECMAScript modules:

```js
require('path/to/script.mjs');
```

Now you can use any type of JavaScript modules:

```js
require('path/to/script.js');
require('path/to/script.cjs');
require('path/to/script.mjs');
```

### [`TypeScript`][TypeScript] Modules

Adds support for [`TypeScript`][TypeScript] modules:

```js
require('path/to/script.ts');
require('path/to/script.cts');
require('path/to/script.mts');
```

### NPM Modules

You can require NPM modules installed into your configured scripts root folder.

```js
require('npm-package-name');
```

See [Tips](#tips) how to avoid performance issues.

### Smart Caching

Modules are cached for performance, but the cache is invalidated if the script or its dependencies change. Use a query string to skip cache invalidation:

```js
require('./someScript.js?someQuery');
```

### Source Maps

Manages source maps for compiled code, allowing seamless debugging in [`Obsidian`][Obsidian].

### Dynamic Imports

Use `dynamicImport()` to extend the built-in [`import()`][import] function with all the features of [`require()`][require] and support for URLs:

```js
await dynamicImport('obsidian');
await dynamicImport('./some/relative/path.js');
await dynamicImport('../some/other/relative/path.js');
await dynamicImport('./some/relative/path.js', 'path/to/current/script.js');
await dynamicImport('./some/relative/path.js', 'path/to/current/note.md');
await dynamicImport('/path/from/root.js');
await dynamicImport('//path/from/vault/root.js');
await dynamicImport('path/to/script.js');
await dynamicImport('path/to/script.cjs');
await dynamicImport('path/to/script.mjs');
await dynamicImport('path/to/script.ts');
await dynamicImport('path/to/script.cts');
await dynamicImport('path/to/script.mts');
await dynamicImport('obsidian?someQuery');
await dynamicImport('https://some-site.com/some-script.js');
await dynamicImport('file:///C:/path/to/vault/then/to/script.js');
await dynamicImport('app://obsidian-resource-path-prefix/C:/path/to/vault/then/to/script.js'); // See obsidian.Platform.resourcePathPrefix
```

### Invocable Scripts

Make any script invocable by defining a module with a default export function (sync or async) that accepts `App` argument

```ts
// cjs sync
module.exports = (app) => { console.log('cjs sync'); };

// cjs async
module.exports = async (app) => { console.log('cjs async'); await Promise.resolve(); };

// mjs sync
export default function invoke(app) { console.log('mjs sync'); };

// mjs async
export default async function invoke(app) { console.log('mjs async'); await Promise.resolve(); };

// cts sync
module.exports = (app: App): void => { console.log('cts sync'); };

// cts async
module.exports = async (app: App): Promise<void> => { console.log('cts async'); await Promise.resolve(); };

// mts sync
export default function invoke(app: App): void { console.log('mts sync'); };

// mts async
export default async function invoke(app: App): Promise<void> { console.log('mts async'); await Promise.resolve(param1); };
```

### Invoke Scripts

Configure a script directory so every script in it can be invoked using the [`Command Palette`][Command Palette]. Use `Fix Require Modules: Invoke Script: <<Choose>>` for more predictable lists:

![Command Palette](images/commmand-palette.png)

![Chooser](images/chooser.png)

### Startup Script

Invoke any script when [`Obsidian`][Obsidian] loads via a configuration setting.

### Hotkeys

Assign hotkeys to frequently used scripts:

![Hotkeys](images/hotkeys.png)

### Code Buttons

Create code buttons that execute [`JavaScript`][JavaScript]/[`TypeScript`][TypeScript]:

````markdown
```code-button Click me!
// CommonJS (cjs) style
const { dependency1 } = require('./path/to/script1.js');

// ES Modules (esm) style
import { dependency2 } from './path/to/script2.js';

// Top-level await
await Promise.resolve(42);

// TypeScript syntax
function myTypeScriptFn(arg: string): void {}
```
````

![Code Button](images/code-button.png)

## Tips

If you plan to use scripts extensively, consider putting them in a [`dot directory`][dot directory], such as `.scripts` within your vault. [`Obsidian`][Obsidian] doesn't track changes within [`dot directories`][dot directory] and won't re-index your `node_modules` folder repeatedly.

## Limitations

### Dynamic [`import()`][import]

Extending dynamic [`import()`][import] expressions to support `const obsidian = await import('obsidian')` is currently impossible due to [`Electron`](https://www.electronjs.org/) limitations within [`Obsidian`][Obsidian]. Although [`Obsidian`][Obsidian] [`1.6.5+`](https://obsidian.md/changelog/2024-06-25-desktop-v1.6.5/) uses [`Node.js v20.14.0`](https://nodejs.org/en/blog/release/v20.14.0) which includes [`Module.register()`][Module Register], it depends on [`Node.js Worker threads`](https://nodejs.org/api/worker_threads.html) and fails with `The V8 platform used by this instance of Node does not support creating Workers`. Use [`dynamicImport()`](#dynamic-imports) as a workaround.

## Installation

- `Fix Require Modules` is available on [the official Community Plugins repository]([https://obsidian.md/plugins](https://obsidian.md/plugins?id=fix-require-modules)).
- Beta releases can be installed through [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Support

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

## License

 © [Michael Naumov](https://github.com/mnaoumov/)

[Command Palette]: https://help.obsidian.md/Plugins/Command+palette

[dot directory]: https://en.wikipedia.org/wiki/Hidden_file_and_hidden_directory#Unix_and_Unix-like_environments

[import]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import

[JavaScript]: https://developer.mozilla.org/en-US/docs/Web/JavaScript

[Module Register]: https://nodejs.org/api/module.html#moduleregisterspecifier-parenturl-options

[Obsidian]: https://obsidian.md/

[require]: https://nodejs.org/api/modules.html#requireid

[TypeScript]: https://www.typescriptlang.org/
