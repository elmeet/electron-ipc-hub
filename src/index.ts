import { ipcRenderer, ipcMain, BrowserWindow } from "electron";
const uniqueStringGenerate = (function () {
  let id = 0;
  return function () {
    id++;
    if (id >= Number.MAX_SAFE_INTEGER) {
      id = 0;
    }
    return `${id}_${Date.now()}`;
  };
})();
const isString = (v: unknown): v is string => typeof v === "string";
const isFunction = (v: unknown): v is (...args: unknown[]) => unknown =>
  typeof v === "function";

const EVENT_MAIN_LISTENRE_NAME = "ipc-main-asynchronous-listen";
const EVENT_RENDERER_LISTENRE_NAME = "ipc-renderer-asynchronous-listen";
const EVENT_RENDERER_LISTENRE_REPLAY_NAME =
  "ipc-renderer-asynchronous-reply-listen";

export type RendererToMainData = {
  id: string;
  data: unknown;
  name: string;
};

export type MainToRendererData = {
  data: unknown;
  name: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Parameter<T extends (args: any) => any> = T extends (args: infer P) => any
  ? P
  : never;

type FunctionPromiseMayBe<T extends (...args: any) => any> = T extends (
  args: any
) => Promise<any>
  ? T
  : T extends (args: infer P) => infer R
  ? ((args: P) => Promise<R>) | T
  : T;

type PromiseResolveType<T> = T extends Promise<infer R> ? R : T;
type ReturnResolveType<T extends (...args: any) => any> = T extends (
  ...args: any
) => infer R
  ? PromiseResolveType<R>
  : any;

export interface MainHubOptions {
  onReceiveBeforeEach?: (arg: RendererToMainData) => void;
  onReplyBeforeEach?: (arg: RendererToMainData) => void;
  onSendBeforeEach?: (arg: MainToRendererData) => void;
}

let singleMainHub: unknown | null = null;

export function useMainHub<
  RendererToMain extends Record<string, (args: any) => any>,
  MainToRenderer extends Record<string, unknown>
>(options?: MainHubOptions) {
  if (process.type === "renderer") {
    throw new Error("You should call this function in the main process");
  }
  if (singleMainHub) {
    return singleMainHub as typeof hub;
  }

  const { onReceiveBeforeEach, onReplyBeforeEach, onSendBeforeEach } =
    options || {};
  const _all: Map<string, Function> = new Map();
  ipcMain.on(EVENT_MAIN_LISTENRE_NAME, (e, msg: RendererToMainData) => {
    if (isFunction(onReceiveBeforeEach)) {
      onReceiveBeforeEach(msg);
    }
    const handler = _all.get(msg.name);
    if (handler) {
      Promise.resolve(handler(msg.data))
        .then((result: unknown) => {
          const replyData = {
            name: msg.name,
            id: msg.id,
            err: null,
            data: result,
          };
          if (isFunction(onReplyBeforeEach)) {
            onReplyBeforeEach(replyData);
          }
          e.reply(EVENT_RENDERER_LISTENRE_REPLAY_NAME, replyData);
        })
        .catch((err: Error) => {
          const replyData = {
            name: msg.name,
            id: msg.id,
            err,
            data: undefined,
          };
          if (isFunction(onReplyBeforeEach)) {
            onReplyBeforeEach(replyData);
          }
          e.reply(EVENT_RENDERER_LISTENRE_REPLAY_NAME, replyData);
        });
    } else {
      const replyData = {
        name: msg.name,
        id: msg.id,
        err: new Error(
          `[electron-ipc-hub main] main process not listen ${msg.name}`
        ),
        data: undefined,
      };
      if (isFunction(onReplyBeforeEach)) {
        onReplyBeforeEach(replyData);
      }
      e.reply(EVENT_RENDERER_LISTENRE_REPLAY_NAME, replyData);
    }
  });

  type MainKey = keyof RendererToMain;
  type MainHandler<K extends MainKey> = FunctionPromiseMayBe<RendererToMain[K]>;

  type RendererKey = keyof MainToRenderer;
  type RendererHandler<K extends RendererKey> = MainToRenderer[K];

  const hub = {
    on<P extends MainKey>(name: P, handler: MainHandler<P>) {
      if (!isString(name)) {
        throw new TypeError("[electron-ipc-hub main] param name is not string");
      }
      if (!isFunction(handler)) {
        throw new TypeError(
          "[electron-ipc-hub main] param handler is not function"
        );
      }
      _all.set(name, handler);
    },
    off<P extends MainKey>(name: P) {
      if (!isString(name)) {
        throw new TypeError("param name is not function");
      }
      if (_all.has(name)) {
        _all.delete(name);
      }
    },
    sendToRenderer<P extends RendererKey>(
      win: BrowserWindow,
      name: P,
      data: RendererHandler<P>
    ) {
      if (isFunction(onSendBeforeEach)) {
        onSendBeforeEach({ name: name as string, data });
      }

      if (!(win instanceof BrowserWindow)) {
        throw new TypeError(
          "[electron-ipc-hub main] param win is not BrowserWindow"
        );
      }
      if (!isString(name)) {
        throw new TypeError("[electron-ipc-hub main] param name is not string");
      }
      if (win.webContents) {
        win.webContents?.send(EVENT_RENDERER_LISTENRE_NAME, {
          name,
          data,
        });
      }
    },
    sendToRenderers<P extends RendererKey>(name: P, data: RendererHandler<P>) {
      if (!isString(name)) {
        throw new TypeError("[electron-ipc-hub main] param name is not string");
      }
      BrowserWindow.getAllWindows().forEach((win) => {
        hub.sendToRenderer(win, name, data);
      });
    },
  };

  singleMainHub = hub;
  return hub;
}

export interface RendererHubOptions {
  onReceiveBeforeEach?: (arg: MainToRendererData) => void;
  onSendBackBeforeEach?: (arg: MainToRendererData) => void;
  onSendBeforeEach?: (arg: RendererToMainData) => void;
}

let singleRendererHub: unknown | null = null;

export function useRendererHub<
  RendererToMain extends Record<string, (args: any) => any>,
  MainToRenderer extends Record<string, unknown>
>(options?: RendererHubOptions) {
  if (process.type !== "renderer") {
    throw new Error("You should call this function in the rendering process");
  }
  if (singleRendererHub) {
    return singleRendererHub as typeof hub;
  }

  const { onReceiveBeforeEach, onSendBackBeforeEach, onSendBeforeEach } =
    options || {};
  const _all: Map<string, Function[]> = new Map();
  const replys: Map<string, Function> = new Map();

  ipcRenderer.on(EVENT_RENDERER_LISTENRE_NAME, (e, msg) => {
    if (isFunction(onReceiveBeforeEach)) {
      onReceiveBeforeEach(msg);
    }
    const handlers = _all.get(msg.name);
    if (handlers) {
      handlers.forEach((handler) => {
        handler(msg.data);
      });
    }
  });

  ipcRenderer.on(EVENT_RENDERER_LISTENRE_REPLAY_NAME, (e, msg) => {
    if (isFunction(onSendBackBeforeEach)) {
      onSendBackBeforeEach(msg);
    }
    const replyHandler = replys.get(msg.id);
    if (replyHandler) {
      replyHandler(msg.err, msg.data);
      replys.delete(msg.id);
    }
  });

  type MainKey = keyof RendererToMain;
  type MainHandler<K extends MainKey> = FunctionPromiseMayBe<RendererToMain[K]>;

  type RendererKey = keyof MainToRenderer;
  type FunctionByParam<K extends RendererKey> = (arg: MainToRenderer[K]) => any;

  const hub = {
    on<P extends RendererKey>(name: P, handler: FunctionByParam<P>) {
      if (!isString(name)) {
        throw new TypeError(
          "[electron-ipc-hub renderer] param name is not string"
        );
      }
      if (!isFunction(handler)) {
        throw new TypeError(
          "[electron-ipc-hub renderer] param handler is not function"
        );
      }
      const handlers = _all.get(name);
      const added = handlers && handlers.push(handler);
      if (!added) {
        _all.set(name, [handler]);
      }
    },
    off<P extends RendererKey>(name: P, handler: FunctionByParam<P>) {
      if (!isString(name)) {
        throw new TypeError(
          "[electron-ipc-hub renderer] param name is not string"
        );
      }
      if (handler && !isFunction(handler)) {
        throw new TypeError(
          "[electron-ipc-hub renderer] param handler is not function"
        );
      }
      if (!handler) {
        _all.delete(name);
        return;
      }
      const handlers = _all.get(name);
      if (handlers) {
        handlers.splice(
          handlers.indexOf(handler as unknown as Function) >>> 0,
          1
        );
      }
    },
    async sendToMain<P extends MainKey>(
      name: P,
      data: Parameter<MainHandler<P>>
    ): Promise<ReturnResolveType<MainHandler<P>>> {
      const id = uniqueStringGenerate();
      const sendData = {
        name: name as string,
        id,
        data,
      };
      if (isFunction(onSendBeforeEach)) {
        onSendBeforeEach(sendData);
      }

      ipcRenderer.send(EVENT_MAIN_LISTENRE_NAME, sendData);
      return new Promise((resolve, reject) => {
        replys.set(
          id,
          (err: Error, data: ReturnResolveType<MainHandler<P>>) => {
            err ? reject(err) : resolve(data);
          }
        );
      });
    },
  };
  singleRendererHub = hub;
  return hub;
}
