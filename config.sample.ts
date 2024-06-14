type Invocable = () => void | Promise<void>;

type Script = {
  name: string;
  invoke: Invocable;
}

type Config = {
  startup: Invocable;
  scripts: Script[];
}

const config: Config = {
  startup: () => {
    console.log("`Fix Require Modules` plugin sample startup script. See README.md for more information.");
  },
  scripts: [
    {
      name: "Sync script",
      invoke: (): void => {
        console.log("`Fix Require Modules` plugin sample sync script. See README.md for more information.");
      }
    },
    {
      name: "Async script",
      invoke: async (): Promise<void> => {
        await Promise.resolve();
        console.log("`Fix Require Modules` plugin sample async script. See README.md for more information.");
      }
    }
  ]
};

export default config;
