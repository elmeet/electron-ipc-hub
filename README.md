<h1 align="center">Electron-Ipc-Hub</h1>

english | [简体中文](./README.zh-CN.md)

<h4>Promise backed IPC For Electron &amp; Typescript type prompt<h4>

## Table of Contents

- [Features](#features)
- [Install](#install)
- [Example](#example)
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
## Features

- **Simple api**
- **Size**: less than 4kb gzipped(even smaller with tree-shaking), no external dependencies required
- **Promise support**
- **Typescript support**: this utility is written in typescript, has type definition inborn
- **hooks**: Support the call of communication hook, which is convenient to view communication data and debugger

## Install

use yarn

```sh
yarn add electron-ipc-hub
```

or npm

```sh
npm install electron-ipc-hub -S
```

## Example:

### use typescript

**Define type**

```typescript
type RendererToMain = {
  ping: (num: number) => string;
};

type MainToRenderer = {
  "set-title": string;
};
```

After introducing types, you will get type constraints and prompts

**renderer => main => renderer**

```typescript
// main
const mainHub = useMainHub<RendererToMain, MainToRenderer>();

// You will get type constraints and tips below
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

**main => renderer**

```typescript
// main 
mainHub.sendToRenderers("set-title", "This is new title");

// renderer
rendererHub.on("set-title", function (title) {
  document.title = title;
});
```

### use javascript

**renderer => main => renderer**

```javascript
// in main
const { useMainHub } = require("electron-ipc-hub");
const mainHub = useMainHub();

mainHub.on("ping", async function (num) {
  return "pong" + num;
});

// in renderer
const { useRendererHub } = require("electron-ipc-hub");
const rendererHub = useRendererHub();

async function fn() {
  const re = await rendererHub.sendToMain("ping", 1);
  console.log(re); Print 'pong1'
}
fn();
```

**main => renderer**

```javascript
// in renderer
rendererHub.on("change-title", (title) => {
  document.title = title;
});

// in main
mainHub.sendToRenderer(win, "change-title", "This is new title");
```

## API

### useMainHub

**useMainHub([options])**

- options

  - `onReceiveBeforeEach` (param: ChannelData) => void (optional)
  - `onReplyBeforeEach` (param: ChannelData) => void (optional)
  - `onSendBeforeEach` (param: ChannelData) => void (optional)

- mainHub.on(name, fn)
  - name: `string` (required) Name of listening event
  - fn: `function` (required) Execution function of listening event
    tips: Due to the need to respond to the request from the renderer, the same name can only be bound once, and the duplicate 'name' will overwrite the previous event with the same name
- mainHub.off(name)
  - name: `string` (required) Name of listening event
- mainHub.sendToRenderer(win, name, data)
  - win: `BrowserWindow` 
  - name: `string` (required) Name of listening event
  - data: `string` | `boolean` | `number` | `array` | `object` ...等 (Your custom data type)
- mainHub.sendToRenderers(name, data)
  - name: `string` (required)
  - data: `string` | `boolean` | `number` | `array` | `object` ...等 (Your custom data type)

### useRendererHub

**useRendererHub([options])**

- options
  - `onReceiveBeforeEach` (param: ChannelData) => void (optional)
  - `onSendBackBeforeEach` (param: ChannelData) => void (optional)
  - `onSendBeforeEach` (param: ChannelData) => void (optional)
- rendererHub.on(name, fn)
  - name: `string` (required) Name of listening event
  - fn: `function` (required) Execution function of listening event
- rendererHub.off(name, fn)
  - name: `string` (required) Name of listening event
  - fn: `function` (optional), Default empty, If it is empty, all the function events named `name` above will be removed
- rendererHub.sendToMain(name, data)
  - name: `string` (required) Name of listening event
  - data: `string` | `boolean` | `number` | `array` | `object` ... (required) (Your custom data type)
  - @return `Promise<response>` `response` 为Your custom data type

### hooks

The 'options' passed in `usemainhub` or `userendererhub` will be executed at a specific stage, for example:

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


// channel: renderer => main => renderer
// Hooks are executed in the following order
[renderer]onSendBeforeEach -> [main]onReceiveBeforeEach -> [main]onReplyBeforeEach -> [renderer]onSendBackBeforeEach

// channel: main => renderer
// Hooks are executed in the following order
[main]onSendBeforeEach -> [renderer]onReceiveBeforeEach

```

renderer => main => renderer

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

// print results:
// <<< [send] {name: 'ping', id: '1_1650525606946', data: 1}
// <<< [receive] { name: 'ping', id: '1_1650525606946', data: 1 }
// <<< [reply] { name: 'ping', id: '1_1650525606946', err: null, data: 'pong1' }
// <<< [send back] {name: 'ping', id: '1_1650525606946', err: null, data: 'pong1'}
```

Debugger with hooks

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
