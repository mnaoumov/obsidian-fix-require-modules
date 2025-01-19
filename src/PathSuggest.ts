import type { App } from 'obsidian';

import { AbstractInputSuggest } from 'obsidian';
import {
  basename,
  extname,
  relative
} from 'obsidian-dev-utils/Path';

import { EXTENSIONS } from './RequireHandler.ts';

export function addPathSuggest(app: App, textInputEl: HTMLInputElement, rootFn: () => string, type: 'file' | 'folder'): PathSuggest {
  return new PathSuggest(app, textInputEl, rootFn, type);
}

const CACHE_DURATION_IN_MILLISECONDS = 30000;

interface PathEntry {
  path: string;
  type: PathEntryType;
}

type PathEntryType = 'file' | 'folder';

class PathSuggest extends AbstractInputSuggest<PathEntry> {
  private pathEntries: null | PathEntry[] = null;

  public constructor(app: App, private textInputEl: HTMLInputElement, private rootFn: () => string, private type: PathEntryType) {
    super(app, textInputEl);

    this.textInputEl.addEventListener('invalid', () => {
      if (this.textInputEl.isActiveElement()) {
        this.textInputEl.setCustomValidity('');
        this.textInputEl.reportValidity();
      }
    });
  }

  public override async getSuggestions(input: string): Promise<PathEntry[]> {
    const entries = await this.getPathEntries(this.app);
    const suggestions = entries.filter((entry) => entry.path.includes(input)).sort((a, b) => a.path.localeCompare(b.path));
    suggestions.unshift({
      path: '',
      type: this.type
    });
    return suggestions;
  }

  public refresh(): void {
    this.pathEntries = null;
  }

  public override renderSuggestion(value: PathEntry, el: HTMLElement): void {
    el.setText(value.path || '(blank)');
  }

  public override selectSuggestion(value: PathEntry): void {
    this.setValue(value.path);
    this.textInputEl.dispatchEvent(new Event('input'));
    setTimeout(this.close.bind(this), 0);
  }

  private async fillPathEntries(app: App, path: string, type: PathEntryType): Promise<void> {
    if (!this.pathEntries) {
      this.pathEntries = [];
    }

    if (basename(path) === 'node_modules') {
      return;
    }

    let shouldAdd = type === this.type && path !== this.rootFn();

    if (shouldAdd) {
      if (type === 'file') {
        const ext = extname(path);
        if (!EXTENSIONS.includes(ext)) {
          shouldAdd = false;
        }
      }
    }

    if (shouldAdd) {
      this.pathEntries.push({
        path: relative(this.rootFn(), path),
        type
      });
    }

    if (type === 'file') {
      return;
    }

    const listedFiles = await app.vault.adapter.list(path);
    for (const file of listedFiles.files) {
      await this.fillPathEntries(app, file, 'file');
    }

    for (const folder of listedFiles.folders) {
      await this.fillPathEntries(app, folder, 'folder');
    }
  }

  private async getPathEntries(app: App): Promise<PathEntry[]> {
    if (!this.pathEntries) {
      this.pathEntries = [];
      await this.fillPathEntries(app, this.rootFn(), 'folder');
    }

    setTimeout(() => {
      this.pathEntries = null;
    }, CACHE_DURATION_IN_MILLISECONDS);
    return this.pathEntries;
  }
}
