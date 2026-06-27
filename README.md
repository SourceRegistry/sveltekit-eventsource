
# @sourceregistry/sveltekit-eventsource

[![npm version](https://img.shields.io/npm/v/@sourceregistry/sveltekit-eventsource?logo=npm)](https://www.npmjs.com/package/@sourceregistry/sveltekit-eventsource)
[![License](https://img.shields.io/npm/l/@sourceregistry/sveltekit-eventsource)](https://github.com/SourceRegistry/sveltekit-eventsource/blob/main/LICENSE)
[![CI](https://github.com/SourceRegistry/sveltekit-eventsource/actions/workflows/ci.yml/badge.svg)](https://github.com/SourceRegistry/sveltekit-eventsource/actions)
[![Codecov](https://img.shields.io/codecov/c/github/SourceRegistry/sveltekit-eventsource)](https://codecov.io/gh/SourceRegistry/sveltekit-eventsource)

Typed **Server-Sent Events (SSE)** integration for **SvelteKit** — strongly-typed client–server communication, custom event channels, and a protocol-level control layer.

---

## Features

- **Strong typing end-to-end** — events are typed via `App.Events`, giving compile-time guarantees for both event names and payloads
- **Bidirectional lifecycle control** — server-initiated close via a versioned protocol message; client-initiated close with proper cleanup
- **Protocol-level control channel** — control messages bypass user serializers and are versioned, validated, and future-proof
- **Custom event channels** — native SSE `event:` field support with multiple application events per stream
- **Debug hooks** — optional structured logging on client and server
- **Full TSDoc coverage** — TypeDoc generation supported out of the box

---

## Installation

```bash
npm install @sourceregistry/sveltekit-eventsource
```

Peer dependency: `svelte@^5`

---

## Core Concept

Events are defined centrally using SvelteKit's `App.Events` interface:

```ts
// src/app.d.ts
declare global {
  namespace App {
    interface Events {
      status: {
        heartbeat: number;
      };
    }
  }
}

export {};
```

This single definition drives server-side `emit()` typing, client-side `on()` typing, and compile-time safety across the entire SSE pipeline.

---

## Server Usage

```ts
// src/routes/sse/+server.ts
import type { RequestHandler } from "./$types";
import { EventSource } from "@sourceregistry/sveltekit-eventsource/server";

export const GET: RequestHandler = () => {
  const sse = new EventSource("status", { debug: true });

  const timer = setInterval(() => {
    sse.emit("heartbeat", Date.now());
  }, 2000);

  sse.once("close", () => {
    clearInterval(timer);
  });

  // Ask the client to close after 5 s
  setTimeout(() => {
    sse.stop();
  }, 5000);

  return sse.response();
};
```

### Server API

| Method / Property | Description |
|---|---|
| `emit(event, payload, id?)` | Send a typed application event |
| `stop()` | Send a protocol-level close request to the client |
| `response(init?)` | Return a `Response` with `Content-Type: text/event-stream` |
| `isOpen` | Whether the stream is currently open |
| `on(event, handler)` | Subscribe to lifecycle events (`open`, `close`, `ping`) |
| `once(event, handler)` | Subscribe once to a lifecycle event |
| `off(event, handler)` | Unsubscribe from a lifecycle event |
| `unsafe.send(data, opts?)` | Send an arbitrary untyped SSE message |
| `unsafe.events` | Raw `EventEmitter` for lifecycle hooks |

---

## Client Usage

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EventSource } from "@sourceregistry/sveltekit-eventsource/client";

  const events = $state<number[]>([]);
  let state = $state<"open" | "closed">("closed");

  let es: EventSource<"status">;

  onMount(() => {
    es = new EventSource("/sse", { debug: true });

    es.onOpen(() => (state = "open"));
    es.onClose(() => (state = "closed"));

    es.on("heartbeat", (n) => {
      events.push(n);
    });
  });

  onDestroy(() => {
    es?.close();
  });
</script>

<p>Connection: {state}</p>

<ul>
  {#each events as e}
    <li>{e}</li>
  {/each}
</ul>
```

### Client API

| Method | Description |
|---|---|
| `on(event, handler)` | Subscribe to a typed application event |
| `once(event, handler)` | Subscribe once to a typed application event |
| `off(event, handler)` | Unsubscribe a handler registered with `on` or `once` |
| `onOpen(handler)` | Subscribe to the `open` lifecycle event |
| `onClose(handler)` | Subscribe to the `close` lifecycle event |
| `onError(handler)` | Subscribe to the `error` lifecycle event |
| `onMessage(handler)` | Subscribe to default (unnamed) SSE messages |
| `close()` | Initiate client-side close |
| `readyState` | Native `EventSource.readyState` |

All handlers are fully typed via `App.Events`.

---

## Control Protocol (SMCP)

This library implements a protocol-level control channel independent of user serialization. User serializers (JSON, base64, msgpack, etc.) must not interfere with control messages such as server-requested close.

**Wire format:**

```
event: __MAGIC_EVENT__
data: {"v":1,"op":"close"}
```

Control messages are always JSON, versioned (`v`), validated at runtime, and forward-compatible.

Full specification: [`docs/sse-magic-protocol.md`](docs/sse-magic-protocol.md)

---

## Package Exports

| Path | Purpose |
|---|---|
| `@sourceregistry/sveltekit-eventsource/client` | Browser client |
| `@sourceregistry/sveltekit-eventsource/server` | SvelteKit server endpoint |

---

## Testing

Protocol compatibility tests are included using **Vitest**:

```bash
npm test
```

Coverage includes protocol encoding, version mismatch handling, schema validation, and forward-compatibility safeguards.

---

## Documentation

Generate API documentation with TypeDoc:

```bash
npm run docs:build
```

Output is written to `/docs`.

---

## Requirements

- Node.js ≥ 16
- SvelteKit application
- Standard SSE (HTTP/1.1 compatible, no polyfills required)

---

## Roadmap

- [ ] Reconnect strategies and resume tokens
- [ ] Backpressure diagnostics
- [ ] Stream multiplexing
- [ ] Protocol v2 extensions

---

## Contributing

Issues and pull requests are welcome. Please follow [Conventional Commits](https://www.conventionalcommits.org/) — this project uses semantic-release for automated versioning and changelog generation.

---

## License

Apache-2.0 © [A.P.A. Slaa](https://github.com/SourceRegistry)
