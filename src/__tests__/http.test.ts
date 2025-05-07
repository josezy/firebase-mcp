import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServerConfig, TransportType } from '../config';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock express
vi.mock('express', () => {
  const mockServerInstance = {
    on: vi.fn(),
    close: vi.fn(),
  };

  const mockApp = {
    use: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    listen: vi.fn().mockReturnValue(mockServerInstance),
  };

  // Create a mock express function with all required properties
  const mockExpress: any = vi.fn(() => mockApp);
  mockExpress.json = vi.fn(() => 'json-middleware');

  return { default: mockExpress };
});

// Mock crypto
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-session-id'),
}));

// Mock StreamableHTTPServerTransport
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
  const mockTransport = {
    sessionId: 'test-session-id',
    onclose: vi.fn(),
    handleRequest: vi.fn(),
  };
  return {
    StreamableHTTPServerTransport: vi.fn().mockImplementation(() => mockTransport),
  };
});

describe('HTTP Transport', () => {
  let config: ServerConfig;
  let mockServer: Server;
  let mockExpress: any;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();

    // Create mock server
    mockServer = {
      connect: vi.fn(),
    } as unknown as Server;

    // Get mock express instance
    mockExpress = express();
  });

  it('should initialize HTTP transport with correct configuration', async () => {
    // Import the module under test
    const { initializeHttpTransport } = await import('../transports/http');

    // Create test config
    config = {
      serviceAccountKeyPath: '/path/to/service-account.json',
      storageBucket: 'test-bucket',
      transport: TransportType.HTTP,
      http: {
        port: 3000,
        host: 'localhost',
        path: '/mcp',
      },
      version: '1.0.0',
      name: 'test-server',
    };

    // Initialize HTTP transport
    await initializeHttpTransport(mockServer, config);

    // Verify express app was created
    expect(express).toHaveBeenCalled();

    // Verify middleware was set up
    expect(mockExpress.use).toHaveBeenCalled();

    // Verify routes were set up
    expect(mockExpress.post).toHaveBeenCalledWith('/mcp', expect.any(Function));
    expect(mockExpress.get).toHaveBeenCalledWith('/mcp', expect.any(Function));
    expect(mockExpress.delete).toHaveBeenCalledWith('/mcp', expect.any(Function));

    // Verify server was started
    expect(mockExpress.listen).toHaveBeenCalledWith(3000, 'localhost', expect.any(Function));
  });

  it('should handle invalid session ID', async () => {
    // Import the module under test
    const { initializeHttpTransport } = await import('../transports/http');

    // Create test config
    config = {
      serviceAccountKeyPath: '/path/to/service-account.json',
      storageBucket: 'test-bucket',
      transport: TransportType.HTTP,
      http: {
        port: 3000,
        host: 'localhost',
        path: '/mcp',
      },
      version: '1.0.0',
      name: 'test-server',
    };

    // Initialize HTTP transport
    await initializeHttpTransport(mockServer, config);

    // Get the POST handler
    const postHandler = mockExpress.post.mock.calls[0][1];

    // Create mock request and response
    const req = {
      headers: {
        // No session ID
      },
      body: { method: 'test' },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    // Call the handler
    await postHandler(req, res);

    // Verify error response was sent
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
  });
});
