import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

class MinimalMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'firebase-mcp-minimal',
        version: '0.6.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Minimal error handler that doesn't log
    this.server.onerror = () => {};
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new MinimalMcpServer();
server.run(); 