// Minimal JSON-RPC 2.0 line client for the Concat API (Bun only).
// Copied from the client of the author's Concat test (17/10/2026), unchanged logic.
// Loopback only: connect() refuses any host other than 127.0.0.1.
import { readFileSync } from "node:fs";

export type Notification = { method: string; params: any };

export class ConcatClient {
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  readonly events: Notification[] = [];
  private waiters: Array<(n: Notification) => void> = [];
  private socket: any;

  static async connect(host: string, port: number, token: string): Promise<ConcatClient> {
    if (host !== "127.0.0.1") throw new Error("refusing non-loopback host " + host);
    const c = new ConcatClient();
    c.socket = await Bun.connect({
      hostname: host,
      port,
      socket: {
        data: (_s, data) => c.onData(data.toString("utf8")),
        error: (_s, e) => console.error("socket error", e),
        close: () => {},
      },
    });
    await c.call("auth", { token });
    return c;
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && msg.id !== null && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(Object.assign(new Error(msg.error.message), { rpc: msg.error }));
        else p.resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        this.waiters.forEach((w) => w(msg));
      }
    }
  }

  call(method: string, params: any = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  waitFor(pred: (n: Notification) => boolean, timeoutMs: number): Promise<Notification> {
    const hit = this.events.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout waiting for event")), timeoutMs);
      this.waiters.push((n) => {
        if (pred(n)) {
          clearTimeout(t);
          resolve(n);
        }
      });
    });
  }

  close() {
    this.socket?.end();
  }
}

export function readToken(path: string): string {
  return readFileSync(path, "utf8").trim();
}
