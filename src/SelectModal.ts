import {
  App,
  FuzzySuggestModal,
  type FuzzyMatch
} from "obsidian";

export default async function selectItem<T>({
  app,
  items,
  itemTextFunc,
  placeholder = ""
}: {
  app: App;
  items: T[];
  itemTextFunc(item: T): string;
  placeholder?: string;
}): Promise<T | null> {
  return await new Promise<T | null>((resolve) => {
    class ItemSelectModal extends FuzzySuggestModal<T> {
      private isSelected!: boolean;

      public constructor() {
        super(app);
      }

      public override getItems(): T[] {
        return items;
      }

      public override getItemText(item: T): string {
        return itemTextFunc(item);
      }

      public override selectSuggestion(
        value: FuzzyMatch<T>,
        evt: MouseEvent | KeyboardEvent,
      ): void {
        this.isSelected = true;
        super.selectSuggestion(value, evt);
      }

      public override onChooseItem(item: T): void {
        resolve(item);
      }

      public override onClose(): void {
        if (!this.isSelected) {
          resolve(null);
        }
      }
    }

    const modal = new ItemSelectModal();
    modal.setPlaceholder(placeholder);
    modal.open();
  });
}
