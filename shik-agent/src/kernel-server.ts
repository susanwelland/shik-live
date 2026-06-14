// shik-agent — local kernel server (the "SHIK MCP server" seam).
// Exposes the Core Self Layer over a tiny local HTTP interface so ANY cognition
// client — on-device or remote — can read the agent's identity through one
// standard surface, exactly as the MCP paper proposes (here as plain HTTP/JSON;
// a full MCP/JSON-RPC transport is the M3 drop-in). Bind to localhost only: the
// identity lives on hardware you own and is not exposed to the network.
import { createServer, Server } from 'node:http';
import { KernelStore } from './kernel-store.js';

export class KernelServer {
  private server: Server | null = null;
  constructor(private store: KernelStore, private port = 8137) {}

  start() {
    this.server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      const s = this.store.get();
      switch (req.url) {
        case '/shik/identity':         // MCP: shik://identity
          return res.end(JSON.stringify({ id: s.id, turnCount: s.turnCount, currentTopic: s.currentTopic }));
        case '/shik/memories':         // MCP: shik://memories
          return res.end(JSON.stringify({ memories: s.coreMemories }));
        case '/shik/session/current':  // MCP: shik://session/current
          return res.end(JSON.stringify({ context: s.sessionContext, events: s.events.slice(0, 30) }));
        case '/shik/presence':
          return res.end(JSON.stringify({ presenceHistory: s.presenceHistory }));
        default:
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'not found' }));
      }
    });
    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[kernel] self-hosted identity server on http://127.0.0.1:${this.port}`);
    });
  }

  stop() {
    this.server?.close();
  }
}
