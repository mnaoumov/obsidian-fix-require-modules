type Tsx = {
  (): void,
  require: (id: string, fromFile: string | URL) => unknown;
  resolve: (id: string, fromFile: string | URL, resolveOptions?: { paths?: string[] | undefined; } | undefined) => string;
  unregister: () => void;
};
