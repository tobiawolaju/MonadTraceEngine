import { WebSocketServer } from 'ws';

export class WsHub {
  constructor(server, { path = '/ws', broadcastWindowMs }) {
    this.wss = new WebSocketServer({ server, path });
    this.queue = [];
    this.timer = setInterval(() => this.flush(), broadcastWindowMs);

    this.wss.on('connection', (socket) => {
      socket.send(JSON.stringify({ type: 'ready' }));
    });
  }

  enqueue(block) {
    this.queue.push(block);
  }

  flush() {
    if (!this.queue.length) return;
    const payload = JSON.stringify({ type: 'blocks', data: this.queue.splice(0) });
    for (const client of this.wss.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }

  close() {
    clearInterval(this.timer);
    this.wss.close();
  }
}
