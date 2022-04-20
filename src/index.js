import { ipcRenderer, ipcMain, BrowserWindow } from "electron";
const uniqueStringGenerate = (function () {
  let id = 0;
  return function () {
    id++;
    return `${id}_${Date.now()}`;
  };
})();
const isString = (v) => typeof v === "string";
const isFunction = (v) => typeof v === "function";

const EVENT_MAIN_LISTENRE_NAME = "ipc-main-asynchronous-listen";
const EVENT_RENDERER_LISTENRE_NAME = "ipc-renderer-asynchronous-listen";
const EVENT_RENDERER_LISTENRE_REPLAY_NAME =
  "ipc-renderer-asynchronous-replay-listen";

function useMainHub(
  {
    handlerBeforeEach = () => {},
    handlerAfterEach = () => {},
    sendToRendererBeforeEach = () => {},
    sendToRendererAfterEach = () => {},
  } = {
    handlerBeforeEach: (...args) => {
      console.log("[main] <<<", ...args);
    },
    handlerAfterEach: (...args) => {
      console.log(`[main] >>> `, ...args);
    },
    sendToRendererBeforeEach: (...args) => {
      console.log(`[main] >>>`, ...args);
    },
    sendToRendererAfterEach: (...args) => {
      console.log(`[main] >>>`,...args);
    },
  }
) {
  const _all = new Map();
  ipcMain.on(EVENT_MAIN_LISTENRE_NAME, (e, msg) => {
    handlerBeforeEach(msg);
    const handler = _all.get(msg.name);
    if (handler) {
      handler(msg.data)
        .then((result) => {
          const replayData = {
            name: msg.name,
            id: msg.id,
            err: null,
            data: result,
          };
          handlerAfterEach(replayData);
          e.reply(EVENT_RENDERER_LISTENRE_REPLAY_NAME, replayData);
        })
        .catch((err) => {
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

  const hub = {
    on(name, handler) {
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
    off(name) {
      if (!isString(name)) {
        throw new TypeError("param name is not function");
      }
      if (_all.has(name)) {
        _all.delete(name);
      }
    },
    sendToRenderer(win, name, data) {
      sendToRendererBeforeEach({ name, data });
      if (!win instanceof BrowserWindow) {
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
    sendToRenderers(name, data) {
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

function useRendererHub(
  {
    handlerBeforeEach = () => {},
    handlerAfterEach = () => {},
    sendToMainBeforeEach = () => {},
    sendToMainAfterEach = () => {},
  } = {
    handlerBeforeEach: (...args) => {
      console.log("[renderer] <<<", ...args);
    },
    handlerAfterEach: (...args) => {
      console.log("[renderer] <<<", ...args);
    },
    sendToMainBeforeEach: (...args) => {
      console.log("[renderer] >>>", ...args);
    },
    sendToMainAfterEach: (...args) => {
      console.log("[renderer] <<<", ...args);
    },
  }
) {
  const _all = new Map();
  const replays = new Map();

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

  const hub = {
    on(name, handler) {
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
    off(name, handler) {
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
        handlers.splice(handlers.indexOf(handler) >>> 0, 1);
      }
    },
    async sendToMain(name, data) {
      const id = uniqueStringGenerate();
      const sendData = {
        name,
        id,
        data,
      };
      sendToMainBeforeEach(sendData);
      ipcRenderer.send(EVENT_MAIN_LISTENRE_NAME, sendData);
      return new Promise((resolve, reject) => {
        replays.set(id, (err, data) => {
          err ? reject(err) : resolve(data);
        });
      });
    },
  };
  return hub;
}

export { useMainHub, useRendererHub };
