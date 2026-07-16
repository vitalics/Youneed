// ── @youneed/cli-plugin-devtools/ws — a tiny RFC 6455 WebSocket adapter ───────
//
// The unified `<youneed-devtools>` shell drives every target over a WebSocket
// (`@youneed/devtools-protocol`). `@youneed/server` ships a full WS stack, but a
// CLI tool must not depend on the whole server framework — so this self-contained
// adapter (frame logic adapted from `@youneed/server`'s `WsConnection`) bridges a
// `node:http` `upgrade` event to a devtools {@link Transport}. Text frames only —
// the protocol is JSON-over-text; ping/pong + close are handled, fragmentation is
// not needed for these small control frames.

import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Duplex } from "node:stream";
import type { IncomingMessage, Server } from "node:http";
import type { Frame, Transport } from "@youneed/devtools-protocol";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** A minimal RFC 6455 connection — text frames, ping/pong, close. */
class WsConnection extends EventEmitter {
  #socket: Duplex;
  #buf = Buffer.alloc(0);
  open = true;

  constructor(socket: Duplex) {
    super();
    this.#socket = socket;
    socket.on("data", (chunk: Buffer) => this.#onData(chunk));
    socket.on("close", () => ((this.open = false), this.emit("close")));
    socket.on("error", () => (this.open = false));
  }

  #onData(chunk: Buffer): void {
    this.#buf = Buffer.concat([this.#buf, chunk]);
    let frame: { opcode: number; payload: Buffer } | null;
    while ((frame = this.#parse())) {
      const { opcode, payload } = frame;
      if (opcode === 0x8) return this.close(); // close
      if (opcode === 0x9) this.#frame(0xa, payload); // ping → pong
      else if (opcode === 0x1) this.emit("message", payload.toString("utf8"));
    }
  }

  #parse(): { opcode: number; payload: Buffer } | null {
    const buf = this.#buf;
    if (buf.length < 2) return null;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) return null;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) return null;
      len = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }
    let maskKey: Buffer | null = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      maskKey = buf.subarray(offset, offset + 4);
      offset += 4;
    }
    if (buf.length < offset + len) return null;
    let payload = buf.subarray(offset, offset + len);
    if (maskKey) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
    }
    this.#buf = buf.subarray(offset + len);
    return { opcode, payload };
  }

  #frame(opcode: number, payload: Buffer): void {
    const len = payload.length;
    let header: Buffer;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    this.#socket.write(Buffer.concat([header, payload]));
  }

  send(data: string): void {
    if (this.open) this.#frame(0x1, Buffer.from(data, "utf8"));
  }

  close(code = 1000): void {
    if (!this.open) return;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code, 0);
    this.#frame(0x8, payload);
    this.open = false;
    this.#socket.end();
  }
}

/**
 * Attach a WebSocket endpoint at `path` to `server`. Each connection is handed
 * to {@link DevtoolsTarget.serve} via `serve(transport)` (which returns a detach
 * fn). Upgrades to other paths are left untouched. Returns a disposer that
 * removes the `upgrade` listener.
 */
export function serveWebSocket(server: Server, path: string, serve: (transport: Transport) => () => void): () => void {
  const onUpgrade = (req: IncomingMessage, socket: Duplex): void => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== path) return; // not ours
    const key = req.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    const accept = createHash("sha1")
      .update(key + WS_GUID)
      .digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" + "Upgrade: websocket\r\n" + "Connection: Upgrade\r\n" + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const ws = new WsConnection(socket);
    let onMessage: ((f: Frame) => void) | undefined;
    const detach = serve({
      send: (f: Frame) => ws.send(JSON.stringify(f)),
      onMessage: (cb) => ((onMessage = cb), () => (onMessage = undefined)),
    });
    ws.on("message", (msg: string) => {
      let frame: Frame;
      try {
        frame = JSON.parse(msg) as Frame;
      } catch {
        return;
      }
      onMessage?.(frame);
    });
    ws.on("close", () => detach());
  };
  server.on("upgrade", onUpgrade);
  return () => void server.off("upgrade", onUpgrade);
}
