# @sourceregistry/sveltekit-eventsource
[![npm version](https://img.shields.io/npm/v/@sourceregistry/sveltekit-eventsource?logo=npm)](https://www.npmjs.com/package/@sourceregistry/sveltekit-eventsource)
[![License](https://img.shields.io/npm/l/@sourceregistry/sveltekit-eventsource)](https://github.com/SourceRegistry/sveltekit-eventsource/blob/main/LICENSE)
[![CI](https://github.com/SourceRegistry/sveltekit-eventsource/actions/workflows/test.yml/badge.svg)](https://github.com/SourceRegistry/sveltekit-eventsource/actions)
[![Codecov](https://img.shields.io/codecov/c/github/SourceRegistry/sveltekit-eventsource)](https://codecov.io/gh/SourceRegistry/sveltekit-eventsource)

Typed Server-Sent Events (SSE) for **SvelteKit** with first-class TypeScript support,
strongly typed client–server communication, and a versioned control protocol.

---

## Overview

This library provides a structured, production-ready abstraction over native
**Server-Sent Events (SSE)** for SvelteKit applications.

It focuses on:

- **Type safety** via `App.Events`
- **Protocol-level control messages**
- **Clean separation** between application payloads and transport mechanics
- **Predictable lifecycle management**

---

## Getting Started

- 📦 Install the package
- 🖥 Set up a server-side SSE endpoint
- 🌐 Subscribe from the client with typed events

See:
- {@link module:client.EventSource | Client API}
- {@link module:server.EventSource | Server API}

---

## Architecture

### Typed Event Model

All application events are defined once using:

```ts
declare global {
  namespace App {
    interface Events {
      status: {
        heartbeat: number;
      };
    }
  }
}
````

This definition drives both:

* server-side `emit()` typing
* client-side `on()` typing

---

## Control Protocol (SMCP)

This library implements a **protocol-level control channel** for SSE, known as:

> **SSE Magic Control Protocol (SMCP)**

SMCP guarantees that critical control messages (such as server-requested close)
remain decodable **even if custom serializers/deserializers are used**.

📄 **Protocol specification**:
➡️ {@page sse-magic-protocol}

---

## API Documentation

* {@link module:client | Client Module}
* {@link module:server | Server Module}

Each module is fully documented using TSDoc.

---

## Status

* Protocol version: **v1**
* Stability: **Experimental (0.x)**
* Node.js: **>= 16**
* Svelte: **>= 5**

---

## License

Apache-2.0 © ProjectSource V.O.F.

