interface Tsx {
  (): void;
  require: (id: string, fromFile: string | URL) => unknown;
  resolve: (id: string, fromFile: string | URL, resolveOptions?: { paths?: string[] | undefined }) => string;
  unregister: () => void;
}
