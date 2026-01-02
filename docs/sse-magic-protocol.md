# SSE Magic Control Protocol (SMCP)
Version: 1  
Status: Draft  
Last-Updated: 2026-01-02

## 1. Abstract
This document specifies a small, versioned control protocol used over Server-Sent Events (SSE) to transmit
library-level control messages (e.g., "close") between a server implementation and a client implementation.
Control messages are considered protocol messages and MUST NOT depend on user-provided serialization or deserialization.

## 2. Motivation
SSE application payloads may be encoded using custom formats (e.g., JSON, base64, msgpack, domain-specific encodings).
If library control messages are encoded using user-provided serializers/deserializers, the client and server may become
unable to communicate critical control signals (such as server-requested connection termination).

To ensure reliable control signaling across arbitrary application encodings, SMCP defines a fixed wire format and parsing
rules for control messages.

## 3. Terminology
The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "MAY" and "OPTIONAL"
in this document are to be interpreted as described in RFC 2119.

- **SSE event name**: the value of the `event:` field in an SSE message block.
- **Control message**: a protocol-level message conforming to SMCP.
- **Application message**: any non-control SSE message, potentially using a user-defined serializer/deserializer.

## 4. Transport
SMCP messages are transported over standard SSE using:
- `event: __MAGIC_EVENT__`
- `data: <JSON-encoded SMCP message>`

SMCP messages MUST use JSON encoding (UTF-8) for the `data:` field payload.

SMCP messages MUST NOT be encoded using any user-provided serializer.

## 5. Wire Format
The `data:` payload MUST be a JSON object with the following properties:

### 5.1. Required Fields
- `v` (number): Protocol version.
- `op` (string): Operation identifier.

### 5.2. Version
Current version is `v = 1`.

Implementations:
- MUST reject messages where `v` is not a supported version.
- MAY emit a diagnostic error or debug log on version mismatch.

### 5.3. Operations (v=1)
The following operations are defined in v=1:

- `op = "close"`
    - Semantics: Server requests that the client closes the SSE connection.

## 6. Semantics
### 6.1. "close" operation
On receiving `{ "v": 1, "op": "close" }`:
- The client MUST emit a logical "close" event with initiator `"server"`.
- The client MUST close the underlying native `EventSource` connection.

## 7. Error Handling
If the client receives an SMCP message that:
- is not valid JSON,
- does not match the SMCP schema,
- has an unsupported version,

then:
- the client SHOULD emit an "error" event (or equivalent diagnostic),
- and MUST NOT crash.

## 8. Compatibility
- Future versions MUST change `v`.
- A v=1 implementation MUST ignore/diagnose v!=1 messages.
- A future implementation MAY support multiple versions simultaneously.

## 9. Security Considerations
SMCP does not provide authentication or integrity by itself.
If attackers can inject events into the SSE stream, they can cause client-side closure by sending `op="close"`.
Deployments SHOULD protect SSE endpoints via appropriate authentication/authorization and transport security (TLS).

## 10. IANA Considerations
None.

## 11. Appendix A: Example
SSE message block:

event: __MAGIC_EVENT__
data: {"v":1,"op":"close"}
