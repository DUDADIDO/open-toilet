import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerEnvelope } from '@open-toilet/protocol';
import { createApp, type App } from '../src/transport/server.js';

let app: App;
let port: number;

beforeAll(async () => {
  app = await createApp({ port: 0 });
  const address = app.server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  await app.close();
});

class TestClient {
  ws: WebSocket;
  messages: ServerEnvelope[] = [];
  private seq = 0;

  constructor() {
    this.ws = new WebSocket(`ws://localhost:${port}/ws`);
    this.ws.on('message', (data) => this.messages.push(JSON.parse(data.toString())));
  }

  open() {
    return new Promise<void>((resolve) => this.ws.once('open', () => resolve()));
  }

  send(type: string, payload: object = {}) {
    this.ws.send(JSON.stringify({ v: 1, type, requestId: `t${++this.seq}`, payload }));
  }

  async waitFor(predicate: (m: ServerEnvelope) => boolean, timeoutMs = 2000): Promise<ServerEnvelope> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = this.messages.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('timeout waiting for message');
  }
}

describe('WebSocket 통합', () => {
  it('두 클라이언트가 접속해 입장 경쟁, 방귀 소리 전달, 퇴장 후 우선 입장을 확인한다', async () => {
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);

    a.send('session.open', { name: '철수' });
    b.send('session.open', { name: '철수' });
    await a.waitFor((m) => m.type === 'session.ready');
    await b.waitFor((m) => m.type === 'session.ready');

    a.send('booth.enter');
    b.send('booth.enter');
    await b.waitFor((m) => m.type === 'request.error' && m.payload.code === 'BOOTH_OCCUPIED');

    a.send('action.perform', { action: 'fart' });
    await a.waitFor((m) => m.type === 'sound.play' && m.payload.action === 'fart');
    await b.waitFor((m) => m.type === 'sound.play' && m.payload.action === 'fart');

    b.send('queue.join');
    await b.waitFor((m) => m.type === 'request.ok' && m.payload.operation === 'queue.join');
    b.send('action.perform', { action: 'knock' });
    await a.waitFor((m) => m.type === 'sound.play' && m.payload.action === 'knock');

    a.send('booth.leave');
    await b.waitFor(
      (m) => m.type === 'state.snapshot' && m.payload.priority?.userId === m.payload.self.userId,
    );

    a.ws.close();
    b.ws.close();
  });

  it('잘못된 JSON과 버전 불일치를 처리한다', async () => {
    const c = new TestClient();
    await c.open();
    c.ws.send('not json');
    await c.waitFor((m) => m.type === 'request.error' && m.payload.code === 'BAD_REQUEST');
    c.ws.send(JSON.stringify({ v: 99, type: 'state.sync', requestId: 'x', payload: {} }));
    await c.waitFor((m) => m.type === 'request.error' && m.payload.code === 'UNSUPPORTED_VERSION');
  });
});

describe('정적 파일 서빙', () => {
  let staticApp: App;
  let staticDir: string;
  let base: string;

  beforeAll(async () => {
    staticDir = mkdtempSync(join(tmpdir(), 'open-toilet-static-'));
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>t</title>');
    staticApp = await createApp({ port: 0, staticDir });
    const address = staticApp.server.address();
    base = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await staticApp.close();
    rmSync(staticDir, { recursive: true, force: true });
  });

  it('잘못된 퍼센트 인코딩 경로는 400으로 응답하고 서버는 계속 동작한다', async () => {
    const bad = await fetch(`${base}/%E0%A4%A`);
    expect(bad.status).toBe(400);
    const ok = await fetch(`${base}/`);
    expect(ok.status).toBe(200);
  });
});
