import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServerConfig, TransportType } from '../config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

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

  const mockExpress = vi.fn(() => mockApp);
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
    StreamableHTTPServerTransport: vi.fn(() => mockTransport),
  };
});

describe('HTTP Transport', () => {
  let config: ServerConfig;
  let mockServer: Server;
  let mockExpress: any;
  let mockTransport: any;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();

    // Create mock server
    mockServer = {
      connect: vi.fn(),
    } as unknown as Server;

    // Get mock express instance
    mockExpress = express();

    // Get mock transport
    mockTransport = new StreamableHTTPServerTransport({});
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

  it('should handle POST requests with existing session', async () => {
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
        'mcp-session-id': 'test-session-id',
      },
      body: { method: 'test' },
    };
    const res = {};

    // Create a mock transports object with the session
    const transports: { [sessionId: string]: any } = {
      'test-session-id': mockTransport,
    };

    // Call the handler
    await postHandler(req, res);

    // Verify handleRequest was called
    expect(mockTransport.handleRequest).toHaveBeenCalledWith(req, res, req.body);
  });
});
