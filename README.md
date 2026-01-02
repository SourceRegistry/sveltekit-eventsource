
# @sourceregistry/sveltekit-eventsource
[![npm version](https://img.shields.io/npm/v/@sourceregistry/sveltekit-eventsource?logo=npm)](https://www.npmjs.com/package/@sourceregistry/sveltekit-eventsource)
[![License](https://img.shields.io/npm/l/@sourceregistry/sveltekit-eventsource)](https://github.com/SourceRegistry/sveltekit-eventsource/blob/main/LICENSE)
[![CI](https://github.com/SourceRegistry/sveltekit-eventsource/actions/workflows/test.yml/badge.svg)](https://github.com/SourceRegistry/sveltekit-eventsource/actions)
[![Codecov](https://img.shields.io/codecov/c/github/SourceRegistry/sveltekit-eventsource)](https://codecov.io/gh/SourceRegistry/sveltekit-eventsource)

Typed **Server-Sent Events (SSE)** integration for **SvelteKit**, providing strongly-typed client–server communication, custom event channels, and a robust protocol-level control layer.

This library is designed for **TypeScript-first**, production-grade SSE usage in SvelteKit applications.

---

## ✨ Features

- 🔒 **Strong typing end-to-end**
  - Events are typed using `App.Events`
  - Compile-time guarantees for event names and payloads
- 🔄 **Bidirectional lifecycle control**
  - Server-initiated close via a versioned protocol message
  - Client-initiated close with proper cleanup
- 🧠 **Protocol-level control channel**
  - Control messages are **independent of user serializers**
  - Versioned, validated, and future-proof
- 🧩 **Custom event channels**
  - Native SSE `event:` support
  - Multiple application events per stream
- 🛠 **Debug hooks**
  - Optional structured logging on client and server
- 📚 **First-class documentation**
  - Full TSDoc coverage
  - TypeDoc generation supported out of the box

---

## 📦 Installation

```bash
npm install @sourceregistry/sveltekit-eventsource
````

Peer dependency:

* `svelte@^5`

---

## 🧠 Core Concept

Events are defined centrally using SvelteKit’s `App.Events` interface:

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

This single definition drives:

* server-side `emit()` typing
* client-side `on()` typing
* compile-time safety across the entire SSE pipeline

---

## 🖥 Server Usage (SvelteKit endpoint)

```ts
//File: src/routes/sse/+server.ts
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

  // Ask client to close after 5s
  setTimeout(() => {
    sse.stop();
  }, 5000);

  return sse.response();
};
```

### Server API Highlights

* `emit(event, payload)`
* `stop()` – protocol-level server-initiated close
* `response()` – returns `Response` with `text/event-stream`
* `unsafe.events` – lifecycle hooks (`open`, `close`, `ping`)

---

## 🌐 Client Usage (Svelte +page.svelte)

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EventSource } from "@sourceregistry/sveltekit-eventsource/client";

  const events = $state<number[]>([]);
  let state = $state<"open" | "closed">("closed");

  let es: EventSource<"status">;

  onMount(() => {
    es = new EventSource("status", { debug: true });

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

<h2>Connection: {state === "open" ? "🟢" : "🔴"}</h2>

<ul>
  {#each events as e}
    <li>{e}</li>
  {/each}
</ul>
```

### Client API Highlights

* `on(event, handler)`
* `once(event, handler)`
* `off(event, handler)`
* `onOpen`, `onClose`, `onError`, `onMessage`
* `close()` – client-initiated close

All handlers are **fully typed**.

---

## 🔐 Magic Control Protocol (SMCP)

This library implements a **protocol-level control channel** for SSE, independent of user serialization.

### Why?

User serializers (JSON, base64, msgpack, etc.) must **never** break control messages like server-requested close.

### Wire Format

```text
event: __MAGIC_EVENT__
data: {"v":1,"op":"close"}
```

### Guarantees

* Always JSON
* Versioned (`v`)
* Validated at runtime
* Future-proof

Full specification:
📄 `docs/sse-magic-protocol.md`

---

## 🧪 Testing

Protocol compatibility tests are included using **Vitest**.

```bash
npm test
```

Tests cover:

* protocol encoding
* version mismatch handling
* schema validation
* forward-compatibility safeguards

---

## 📚 Documentation

This project is fully documented using **TSDoc**.

Generate API documentation:

```bash
npm run docs:build
```

Output:

```
/docs
```

---

## 📤 Package Exports

```ts
import { EventSource } from "@sourceregistry/sveltekit-eventsource/client";
import { EventSource } from "@sourceregistry/sveltekit-eventsource/server";
```

| Path       | Purpose              |
| ---------- | -------------------- |
| `./client` | Browser client SSE   |
| `./server` | SvelteKit server SSE |

---

## ⚠️ Requirements & Notes

* Node.js ≥ 16
* Designed for **SvelteKit**
* Uses standard SSE (HTTP/1.1 compatible)
* No polyfills required

---

## 🧭 Roadmap

* [ ] Reconnect strategies & resume tokens
* [ ] Backpressure diagnostics
* [ ] Stream multiplexing
* [ ] Protocol v2 extensions

---

## 📄 License

Apache-2.0 © A.P.A. Slaa

---

## 🧑‍💻 Author

**A.P.A. Slaa**
📧 [a.p.a.slaa@projectsource.nl](mailto:a.p.a.slaa@projectsource.nl)
🌐 [https://github.com/SourceRegistry](https://github.com/SourceRegistry)

---

## ⭐ Contributing

Issues and pull requests are welcome.
Please follow conventional commits for releases.
