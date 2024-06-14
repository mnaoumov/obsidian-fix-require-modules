type Invocable = () => void | Promise<void>;

type Script = {
  name: string;
  invoke: Invocable;
  isStartupScript?: boolean;
}

export type Config = Script[];
