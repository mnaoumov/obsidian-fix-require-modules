import type { App } from 'obsidian';

import {
  Events,
  Setting
} from 'obsidian';
import {
  convertAsyncToSync,
  invokeAsyncSafely
} from 'obsidian-dev-utils/Async';
import { appendCodeBlock } from 'obsidian-dev-utils/HTMLElement';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import {
  extname,
  join
} from 'obsidian-dev-utils/Path';

import type { CodeScriptToolkitPlugin } from './CodeScriptToolkitPlugin.ts';

import { addPathSuggest } from './PathSuggest.ts';
import { EXTENSIONS } from './RequireHandler.ts';

export class CodeScriptToolkitPluginPluginSettingsTab extends PluginSettingsTabBase<CodeScriptToolkitPlugin> {
  public override display(): void {
    this.containerEl.empty();
    const events = new Events();

    new Setting(this.containerEl)
      .setName('Script modules root')
      .setDesc(createFragment((f) => {
        f.appendText('Path to the folder that is considered as ');
        appendCodeBlock(f, '/');
        f.appendText(' in ');
        appendCodeBlock(f, 'require("/script.js")');
        f.createEl('br');
        f.appendText('Leave blank to use the root of the vault.');
      }))
      .addText((text) => {
        this.bind(text, 'modulesRoot', {
          onChanged: () => {
            events.trigger('modulesRootChanged');
          },
          shouldShowValidationMessage: false,
          valueValidator: async (uiValue) => {
            if (!uiValue) {
              return;
            }

            return await validatePath(this.plugin.app, uiValue, 'folder');
          }
        })
          .setPlaceholder('path/to/script/modules/root');

        addPathSuggest(this.plugin.app, text.inputEl, () => '', 'folder');
      });

    new Setting(this.containerEl)
      .setName('Invocable scripts folder')
      .setDesc(createFragment((f) => {
        f.appendText('Path to the folder with invocable scripts.');
        f.createEl('br');
        f.appendText('Should be a relative path to the ');
        appendCodeBlock(f, 'Script modules root');
        f.createEl('br');
        f.appendText('Leave blank if you don\'t use invocable scripts.');
      }))
      .addText((text) => {
        this.bind(text, 'invocableScriptsFolder', {
          shouldShowValidationMessage: false,
          valueValidator: async (uiValue) => {
            if (!uiValue) {
              return;
            }

            const path = join(this.plugin.settings.modulesRoot, uiValue);
            return await validatePath(this.plugin.app, path, 'folder');
          }
        })
          .setPlaceholder('path/to/invocable/scripts/folder');

        const suggest = addPathSuggest(this.plugin.app, text.inputEl, () => this.plugin.settings.modulesRoot, 'folder');

        events.on(
          'modulesRootChanged',
          convertAsyncToSync(async () => {
            await this.revalidate(text);
            suggest.refresh();
          })
        );
      });

    new Setting(this.containerEl)
      .setName('Startup script path')
      .setDesc(createFragment((f) => {
        f.appendText('Path to the invocable script executed on startup.');
        f.createEl('br');
        f.appendText('Should be a relative path to the ');
        appendCodeBlock(f, 'Script modules root');
        f.createEl('br');
        f.appendText('Leave blank if you don\'t use startup script.');
      }))
      .addText((text) => {
        this.bind(text, 'startupScriptPath', {
          shouldShowValidationMessage: false,
          // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
          valueValidator: async (uiValue): Promise<string | void> => {
            if (!uiValue) {
              return;
            }

            const path = join(this.plugin.settings.modulesRoot, uiValue);
            const ans = await validatePath(this.plugin.app, path, 'file');
            if (ans) {
              return ans;
            }

            const ext = extname(path);
            if (!EXTENSIONS.includes(ext)) {
              return `Only the following extensions are supported: ${EXTENSIONS.join(', ')}`;
            }
          }
        })
          .setPlaceholder('path/to/startup.ts');
        const suggest = addPathSuggest(this.plugin.app, text.inputEl, () => this.plugin.settings.modulesRoot, 'file');

        events.on(
          'modulesRootChanged',
          convertAsyncToSync(async () => {
            await this.revalidate(text);
            suggest.refresh();
          })
        );
      });

    new Setting(this.containerEl)
      .setName('Hotkeys')
      .setDesc('Hotkeys to invoke scripts')
      .addButton((button) =>
        button
          .setButtonText('Configure')
          .setTooltip('Configure Hotkeys')
          .onClick(() => {
            const hotkeysTab = this.app.setting.openTabById('hotkeys');
            hotkeysTab.searchComponent.setValue(`${this.plugin.manifest.name}:`);
            hotkeysTab.updateHotkeyVisibility();
          })
      );

    new Setting(this.containerEl)
      .setName('Mobile changes checking interval')
      .setDesc('Interval in seconds to check for changes in the invocable scripts folder (only on mobile)')
      .addText((text) => {
        this.bind(text, 'mobileChangesCheckingIntervalInSeconds', {
          componentToPluginSettingsValueConverter: (value: string) => parseInt(value, 10),
          pluginSettingsToComponentValueConverter: (value: number) => value.toString(),
          // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
          valueValidator(value: string): string | void {
            const number = parseInt(value, 10);
            if (isNaN(number) || number < 1) {
              return 'Interval must be greater than 0';
            }
          }
        })
          .setPlaceholder('30');

        text.inputEl.type = 'number';
        text.inputEl.min = '1';
      });
  }

  public override hide(): void {
    invokeAsyncSafely(this.plugin.applyNewSettings.bind(this.plugin));
  }
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
async function validatePath(app: App, path: string, type: 'file' | 'folder'): Promise<string | void> {
  if (!await app.vault.exists(path)) {
    return 'Path does not exist';
  }

  const stat = await app.vault.adapter.stat(path);
  if (stat?.type !== type) {
    return `Path is not a ${type}`;
  }
}
