import {
  App,
  FuzzySuggestModal,
  type FuzzyMatch
} from "obsidian";

export default class ScriptSelectorModal extends FuzzySuggestModal<string> {
  private resolve!: (value: string | null) => void;
  private isSelected!: boolean;
  private readonly promise: Promise<string | null>;
  private readonly scriptNames: string[];

  private constructor(app: App, scriptNames: string[]) {
    super(app);
    this.scriptNames = scriptNames;

    this.promise = new Promise<string | null>((resolve) => {
      this.resolve = resolve;
    });

    this.setPlaceholder("Choose script");
    this.open();
  }

  public override getItems(): string[] {
    return this.scriptNames;
  }

  public override getItemText(item: string): string {
    return item;
  }

  public override selectSuggestion(
    value: FuzzyMatch<string>,
    evt: MouseEvent | KeyboardEvent,
  ): void {
    this.isSelected = true;
    super.selectSuggestion(value, evt);
  }

  public override onChooseItem(item: string): void {
    this.resolve(item);
  }

  public override onClose(): void {
    if (!this.isSelected) {
      this.resolve(null);
    }
  }

  public static async select(app: App, scriptNames: string[]): Promise<string | null> {
    const modal = new ScriptSelectorModal(app, scriptNames);
    return await modal.promise;
  }
}
