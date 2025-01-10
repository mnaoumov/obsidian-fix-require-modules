# CHANGELOG

## 8.6.0

- Avoid confusing warnings

## 8.5.0

- Debug successful execution
- Allow disabling system messages
- Don't cache empty modules

## 8.4.0

- https://github.com/mnaoumov/obsidian-dev-utils/releases/tag/12.0.0
- Fix multiple initialization
- Resolve entry point
- Support circular dependencies
- Support nested path without exports node
- Handle scoped modules
- Add suffixes for relative paths

## 8.3.0

- Add support for private modules
- Check suffixes for missing paths

## 8.2.0

- Add `autoOutput:false`

## 8.1.0

- Replace `window.builtInModuleNames` with `require('obsidian/builtInModuleNames')`

## 8.0.2

- Fix initial scripts initialization

## 8.0.1

- Expose window.builtInModuleNames
- Apply rebranding

## 8.0.0

- Add renderMarkdown
- Add console:false
- Pass container
- Add autorun
- Log last value
- Handle console
- Better stack traces
- Handle system root
- Add requireAsync
- Add support for nested console calls, eval, new Function()
- Fix caching
- Add validation
- Add mobile watcher

## 7.0.0

- Load/unload temp plugin
- Add mobile version
- https://github.com/mnaoumov/obsidian-dev-utils/releases/tag/11.2.0

## 6.2.2

- Update libs

## 6.2.1

- Update libs

## 6.2.0

- Add support for '#privatePath' imports

## 6.1.0

- Add cleanup() support

## 6.0.0

- Force invoke name

## 5.2.3

- Update libs

## 5.2.2

- Fix (no caption)

## 5.2.1

- Update libs

## 5.2.0

- Add Clear Cache command

## 5.1.1

- Fix chmod

## 5.1.0

- Add Clear cache button
- Fix dependencies resolution

## 5.0.5

- Fix caching path

## 5.0.4

- Load plugin properly

## 5.0.3

- Fix esbuild first load

## 5.0.2

- Fix posix paths on Windows

## 5.0.1

- Fix build
- Lint

## 5.0.0

- Pass app to Invocables

## 4.9.1

- Fix esbuild resolution

## 4.9.0

- Handle folder imports
- Preserve __esModule flag
- Allow loading named modules from modulesRoot

## 4.8.0

- Switch to obsidian-dev-utils
- Add obsidian/app

## 4.7.0

- Use proper path for chmod

## 4.6.0

- Make binary runnable in Linux

## 4.5.0

- Fix absolute paths in Linux

## 4.4.0

- Fix installing from scratch

## 4.3.0

- Download esbuild binaries based on the platform
- Proper handle for circular dependencies in ESM

## 4.2.0

- Better fix for circular dependency

## 4.1.0

- Handle circular dependencies
- Fix relative path

## 4.0.0

- Add vault-root based require
- Add currentScriptPath to dynamicImport
- Support code blocks with more than 3 backticks
- Fix resolve for non-relative paths
- Register dynamicImport
- Use babel to support top level await
- Fix esbuild binary suffix

## 3.4.2

- Ensure settings are loaded before patching require

## 3.4.1

- Register code-button block earlier during load

## 3.4.0

- Fix require absolute paths

## 3.3.0

- Proper check for `require(".script.ts")`

## 3.2.1

- Show notice when settings saved

## 3.2.0

- Update README

## 3.1.0

- Download esbuild dependencies

## 3.0.0

- Watch script folder changes
- Enable code highlighting
- Check for script existence
- Process all scripts from the config folder
- Ensure stacktrace is accurate
- Reload config on every invoke to ensure latest dependency
- Fix timestamp check
- Fix circular dependencies
- Register code block
- Allow both CommonJS and ESM configs
- Add hotkeys button
- Add save button
- Fix immutability
- Fix performance for missing module
- Make dependency check reliable
- Add support for evaled dv.view()
- Invalidate cache if script changed
- Properly manage nested require
- Add support for local cjs

## 2.0.0

- Simplify to use Module.require, expose builtInModuleNames

## 1.0.1

- Initial version
