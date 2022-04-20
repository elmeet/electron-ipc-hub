import { ipcRenderer, ipcMain, BrowserWindow } from "electron";
const uniqueStringGenerate = (function () {
  let id = 0;
  return function () {
    id++;
    return `${id}_${Date.now()}`;
  };
})();
const isString = (v: unknown): v is string => typeof v === "string";
const isFunction = (v: unknown): v is (...args: unknown[]) => unknown =>
  typeof v === "function";

const EVENT_MAIN_LISTENRE_NAME = "ipc-main-asynchronous-listen";
const EVENT_RENDERER_LISTENRE_NAME = "ipc-renderer-asynchronous-listen";
const EVENT_RENDERER_LISTENRE_REPLAY_NAME =
  "ipc-renderer-asynchronous-replay-listen";

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

function useMainHub<
  RendererToMain extends Record<string, (args: any) => any>,
  MainToRenderer extends Record<string, unknown>
>(
  {
    handlerBeforeEach = () => {},
    handlerAfterEach = () => {},
    sendToRendererBeforeEach = () => {},
    sendToRendererAfterEach = () => {},
  }: {
    handlerBeforeEach: (arg: RendererToMainData) => void;
    handlerAfterEach: (arg: RendererToMainData) => void;
    sendToRendererBeforeEach: (arg: MainToRendererData) => void;
    sendToRendererAfterEach: (arg: MainToRendererData) => void;
  } = {
    handlerBeforeEach: () => {},
    handlerAfterEach: () => {},
    sendToRendererBeforeEach: () => {},
    sendToRendererAfterEach: () => {},
  }
) {
  const _all: Map<string, Function> = new Map();
  ipcMain.on(EVENT_MAIN_LISTENRE_NAME, (e, msg: RendererToMainData) => {
    handlerBeforeEach(msg);
    const handler = _all.get(msg.name);
    if (handler) {
      handler(msg.data)
        .then((result: unknown) => {
          const replayData = {
            name: msg.name,
            id: msg.id,
            err: null,
            data: result,
          };
          handlerAfterEach(replayData);
          e.reply(EVENT_RENDERER_LISTENRE_REPLAY_NAME, replayData);
        })
        .catch((err: Error) => {
          const replayData = {
            name: msg.name,
            id: msg.id,
            err,
            data: undefined,
          };
          handlerAfterEach(replayData);
          e.reply(EVENT_RENDERER_LISTENRE_REPLAY_NAME, replayData);
        });
    } else {
      const replayData = {
        name: msg.name,
        id: msg.id,
        err: new Error(
          `[electron-ipc-hub main] main process not listen ${msg.name}`
        ),
        data: undefined,
      };
      handlerAfterEach(replayData);
      e.reply(EVENT_RENDERER_LISTENRE_REPLAY_NAME, replayData);
    }
  });

  type MainKey = keyof RendererToMain;
  type MainHandler<K extends MainKey> = RendererToMain[K];

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
      sendToRendererBeforeEach({ name: name as string, data });
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
      sendToRendererAfterEach({ name, data });
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
  return hub;
}

function useRendererHub<
  RendererToMain extends Record<string, (args: any) => any>,
  MainToRenderer extends Record<string, unknown>
>(
  {
    handlerBeforeEach = () => {},
    handlerAfterEach = () => {},
    sendToMainBeforeEach = () => {},
    sendToMainAfterEach = () => {},
  }: {
    handlerBeforeEach: (arg: MainToRendererData) => void;
    handlerAfterEach: (arg: MainToRendererData) => void;
    sendToMainBeforeEach: (arg: RendererToMainData) => void;
    sendToMainAfterEach: (arg: RendererToMainData) => void;
  } = {
    handlerBeforeEach: () => {},
    handlerAfterEach: () => {},
    sendToMainBeforeEach: () => {},
    sendToMainAfterEach: () => {},
  }
) {
  const _all: Map<string, Function[]> = new Map();
  const replays: Map<string, Function> = new Map();

  ipcRenderer.on(EVENT_RENDERER_LISTENRE_NAME, (e, msg) => {
    handlerBeforeEach(msg);
    const handlers = _all.get(msg.name);
    if (handlers) {
      handlers.forEach((handler) => {
        handler(msg.data);
      });
    }
    handlerAfterEach(msg);
  });

  ipcRenderer.on(EVENT_RENDERER_LISTENRE_REPLAY_NAME, (e, msg) => {
    sendToMainAfterEach(msg);
    const replayHandler = replays.get(msg.id);
    if (replayHandler) {
      replayHandler(msg.err, msg.data);
      replays.delete(msg.id);
    }
  });

  type MainKey = keyof RendererToMain;
  type MainHandler<K extends MainKey> = RendererToMain[K];

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
    ): Promise<ReturnType<MainHandler<P>>> {
      const id = uniqueStringGenerate();
      const sendData = {
        name: name as string,
        id,
        data,
      };
      sendToMainBeforeEach(sendData);
      ipcRenderer.send(EVENT_MAIN_LISTENRE_NAME, sendData);
      return new Promise((resolve, reject) => {
        replays.set(id, (err: Error, data: ReturnType<MainHandler<P>>) => {
          err ? reject(err) : resolve(data);
        });
      });
    },
  };
  return hub;
}

export { useMainHub, useRendererHub };
