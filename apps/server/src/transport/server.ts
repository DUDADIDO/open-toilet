import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Engine } from '../domain/engine.js';

const MAX_MESSAGE_BYTES = 4096;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const TICK_MS = 250;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

export interface AppOptions {
  port: number;
  staticDir?: string;
  allowedOrigins?: string[];
}

export interface App {
  server: Server;
  engine: Engine;
  close(): Promise<void>;
}

export function createApp(options: AppOptions): Promise<App> {
  const sockets = new Map<string, WebSocket>();

  const engine = new Engine({
    now: () => Date.now(),
    out: {
      send(connId, message) {
        const ws = sockets.get(connId);
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
          ws.terminate(); // close 이벤트에서 유예 정책 적용
          return;
        }
        ws.send(JSON.stringify(message));
      },
      close(connId, code, reason) {
        sockets.get(connId)?.close(code, reason);
      },
    },
  });

  const server = createServer((req, res) => {
    // HTTP 요청 하나의 예외가 프로세스 전체(메모리의 모든 세션·부스 상태)를 날리지 않게 막는 마지막 안전망
    try {
      serveStatic(req, res, options.staticDir);
    } catch (error) {
      console.error('[http] unexpected error', error);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    const originAllowed =
      !options.allowedOrigins?.length || (origin !== undefined && options.allowedOrigins.includes(origin));
    if (pathname !== '/ws' || !originAllowed) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const connId = randomUUID();
    sockets.set(connId, ws);
    engine.connect(connId);

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        ws.close(1003, 'binary not supported');
        return;
      }
      engine.message(connId, data.toString());
    });
    ws.on('close', () => {
      sockets.delete(connId);
      engine.close(connId);
    });
    ws.on('error', () => ws.terminate());
  });

  const timer = setInterval(() => engine.tick(), TICK_MS);

  return new Promise((resolve) => {
    server.listen(options.port, () => {
      resolve({
        server,
        engine,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(timer);
            for (const ws of sockets.values()) ws.terminate();
            wss.close();
            server.close(() => done());
          }),
      });
    });
  });
}

function serveStatic(req: IncomingMessage, res: ServerResponse, staticDir?: string): void {
  if (!staticDir || !existsSync(staticDir)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Open Toilet server. WebSocket endpoint: /ws');
    return;
  }
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // 잘못된 퍼센트 인코딩(예: /%E0%A4%A)이 프로세스를 죽이지 않도록 400으로 응답한다
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }
  const safe = normalize(decoded).replace(/^([/\\])+/, '');
  let file = join(staticDir, safe);
  let body: Buffer;
  try {
    if (!file.startsWith(staticDir) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(staticDir, 'index.html'); // SPA fallback
    }
    body = readFileSync(file);
  } catch {
    // 빌드 중이라 dist가 잠깐 비었거나 파일이 사라진 경우: 프로세스를 죽이지 않고 잠시 후 다시 시도하게 한다
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '1' });
    res.end('Service Unavailable');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
}
