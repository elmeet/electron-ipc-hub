

<h1 align="center">Electron-Ipc-Hub</h1>

简体中文 | [english](./README.md) 


<h4>简单的 electron ipc 通信, Typescript 完整支持, 可对通信类型定义和约束<h4>

## 📝 目录

- [功能](#features)
- [安装](#install)
- [例子](#example)
- [API](#usage)
  - [useMainHub](#useMainHub)
    - [on](#useMainHub)
    - [off](#useMainHub)
    - [sendToRenderer](#useMainHub)
    - [sendToRenderers](#useMainHub)
  - [useRendererHub](#useRendererHub)
    - [on](#useRendererHub)
    - [off](#useRendererHub)
    - [sendToMain](#useRendererHub)
  - [hooks](#hooks)

## 特征

- **简单的 api**
- **大小**: gzip 压缩后小于 4kb, 没有其他依赖
- **Promise 支持**
- **Typescript 支持**: 使用 typescript 编写, 类型提示, 且可对通信类型定义和约束
- **钩子**: 支持通讯钩子调用, 方便查看通讯数据和 debugger

## 安装

使用 yarn

```sh
yarn add electron-ipc-hub
```

或者 npm

```sh
npm install electron-ipc-hub -S
```

## 例子:

### 使用 typescript

**定义类型**

```typescript
type RendererToMain = {
  ping: (num: number) => string;
};

type MainToRenderer = {
  "set-title": string;
};
```

引入类型, 后续将获得类型约束和提示

**渲染进程 => 主进程 => 渲染进程**

```typescript
// main
const mainHub = useMainHub<RendererToMain, MainToRenderer>();

// 以下将获得类型约束和提示
mainHub.on("get-title", async function (num) {
  return "pong" + num;
});

// renderer
const rendererHub = useRendererHub<RendererToMain, MainToRenderer>();

async function fn() {
  const re = await rendererHub.sendToMain("ping", 1);
  console.log(re); // Print 'pong1'
}
fn();
```

**主进程 => 渲染进程**

```typescript
// main 主进程
mainHub.sendToRenderers("set-title", "这是一个新 title");

// 渲染进程
rendererHub.on("set-title", function (title) {
  document.title = title;
});
```

### 使用 javascript

**渲染进程 => 主进程 => 渲染进程**

```javascript
// 主进程 main
const { useMainHub } = require("electron-ipc-hub");
const mainHub = useMainHub();

mainHub.on("ping", async function (num) {
  return "pong" + num;
});

// 渲染进程 renderer
const { useRendererHub } = require("electron-ipc-hub");
const rendererHub = useRendererHub();

async function fn() {
  const re = await rendererHub.sendToMain("ping", 1);
  console.log(re); Print 'pong1'
}
fn();
```

**主进程 => 渲染进程**

```javascript
// 渲染进程
rendererHub.on("change-title", (title) => {
  document.title = title;
});

// 主进程
mainHub.sendToRenderer(win, "change-title", "我是一个新 title");
```

## API

### useMainHub

**useMainHub([options])**

- options

  - `onReceiveBeforeEach` (param: ChannelData) => void (可选)
  - `onReplyBeforeEach` (param: ChannelData) => void (可选)
  - `onSendBeforeEach` (param: ChannelData) => void (可选)

- mainHub.on(name, fn)
  - name: `string` (必选) 监听事件的名称
  - fn: `function` (必选) 监听事件的执行函数
    tips: 由于需要响应来自渲染进程的请求, 相同名称仅可绑定一次, 重复的`name`将覆盖之前同名的事件
- mainHub.off(name)
  - name: `string` (必选) 监听事件的名称
- mainHub.sendToRenderer(win, name, data)
  - win: `BrowserWindow` 要发送数据的窗口
  - name: `string` (必选) 监听事件的名称
  - data: `string` | `boolean` | `number` | `array` | `object` ...等 (你自定义的数据类型)
- mainHub.sendToRenderers(name, data)
  - name: `string` (必选)
  - data: `string` | `boolean` | `number` | `array` | `object` ...等 (你自定义的数据类型)

### useRendererHub

**useRendererHub([options])**

- options
  - `onReceiveBeforeEach` (param: ChannelData) => void (可选)
  - `onSendBackBeforeEach` (param: ChannelData) => void (可选)
  - `onSendBeforeEach` (param: ChannelData) => void (可选)
- rendererHub.on(name, fn)
  - name: `string` (必选) 监听事件的名称
  - fn: `function` (必选) 监听事件的执行函数
- rendererHub.off(name, fn)
  - name: `string` (必选) 监听事件的名称
  - fn: `function` (可选), 默认为空, 为空则移除所有绑定以上名为 `name` 的函数事件
- rendererHub.sendToMain(name, data)
  - name: `string` (必选) 监听事件的名称
  - data: `string` | `boolean` | `number` | `array` | `object` ...等 (必选) (你自定义的数据类型)
  - @return `Promise<response>` `response` 为你自定义的数据类型

### hooks

在 `useMainHub` 或 `useRendererHub` 传入的 `options` 会在特定阶段执行, 例如:

```typescript
// main
const mainHub = useMainHub({
  onReceiveBeforeEach(data) {
    console.log("<<< [receive]", data);
  },
  onReplyBeforeEach(data) {
    console.log(">>> [reply]", data);
  },
  onSendBeforeEach(data) {
    console.log(">>> [send]", data);
  },
});

// renderer
const rendererHub = useRendererHub({
  onSendBeforeEach: (data) => {
    console.log("<<< [send]", data);
  },
  onSendBackBeforeEach: (data) => {
    console.log("<<< [send back]", data);
  },
  onReceiveBeforeEach: (data) => {
    console.log("<<< [receive]", data);
  },
});


// 通信: 渲染进程 => 主进程 => 渲染进程
// 钩子会按以下顺序执行
[renderer]onSendBeforeEach -> [main]onReceiveBeforeEach -> [main]onReplyBeforeEach -> [renderer]onSendBackBeforeEach

// 通信: 主进程 => 渲染进程
// 钩子会按以下顺序执行
[main]onSendBeforeEach -> [renderer]onReceiveBeforeEach

```

例子: 渲染进程 => 主进程 => 渲染进程

```typescript
// main
mainHub.on("ping", async function (num) {
  return "pong" + num;
});

// renderer
async function fn() {
  const re = await rendererHub.sendToMain("ping", 1);
}
fn();

// 以上打印结果:
// <<< [send] {name: 'ping', id: '1_1650525606946', data: 1}
// <<< [receive] { name: 'ping', id: '1_1650525606946', data: 1 }
// <<< [reply] { name: 'ping', id: '1_1650525606946', err: null, data: 'pong1' }
// <<< [send back] {name: 'ping', id: '1_1650525606946', err: null, data: 'pong1'}
```

借助 hooks 进行 debugger

```typescript
const rendererHub = useRendererHub({
  onSendBeforeEach: (data) => {
    debugger;
  },
  onSendBackBeforeEach: (data) => {
    debugger;
  },
});
```
