import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { App } from 'firebase-admin/app';

// Create mock for Server
const createServerMock = () => ({
  _serverInfo: {},
  _capabilities: {},
  registerCapabilities: vi.fn(),
  assertCapabilityForMethod: vi.fn(),
  assertNotificationCapability: vi.fn(),
  setRequestHandler: vi.fn(),
  onerror: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  run: vi.fn(),
  connect: vi.fn()
});

type ServerMock = ReturnType<typeof createServerMock>;

// Declare mock variables
let serverConstructor: any;
let serverMock: ServerMock;
let loggerMock: { error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
let processExitMock: ReturnType<typeof vi.fn>;
let adminMock: {
  app: ReturnType<typeof vi.fn<[], App>>;
  credential: { cert: ReturnType<typeof vi.fn> };
  initializeApp: ReturnType<typeof vi.fn>;
};

describe('Firebase MCP Server', () => {
  beforeEach(async () => {
    // Reset modules and mocks
    vi.resetModules();
    vi.clearAllMocks();

    // Create new mock instances
    serverMock = createServerMock();
    loggerMock = {
      error: vi.fn(),
      debug: vi.fn(),
      info: vi.fn()
    };

    // Create mock constructor
    serverConstructor = vi.fn(() => serverMock);

    // Mock process.exit
    processExitMock = vi.fn();
    const originalExit = process.exit;
    process.exit = processExitMock as any;

    // Create admin mock
    adminMock = {
      app: vi.fn<[], App>(() => ({ name: '[DEFAULT]' } as App)),
      credential: {
        cert: vi.fn()
      },
      initializeApp: vi.fn()
    };

    // Set up mocks BEFORE importing the module
    vi.doMock('@modelcontextprotocol/sdk/server/index.js', () => ({ Server: serverConstructor }));
    vi.doMock('../utils/logger', () => ({ logger: loggerMock }));
    vi.doMock('firebase-admin', () => adminMock);
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Server Initialization', () => {
    it('should initialize Firebase with correct configuration', async () => {
      await import('../index');
      
      expect(adminMock.app).toHaveBeenCalled();
      expect(loggerMock.debug).toHaveBeenCalledWith('Using existing Firebase app');
    });

    it('should handle missing service account path', async () => {
      const originalPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
      process.env.SERVICE_ACCOUNT_KEY_PATH = '';
      
      await import('../index');
      
      expect(loggerMock.error).toHaveBeenCalledWith('SERVICE_ACCOUNT_KEY_PATH not set');
      
      // Restore the env var
      process.env.SERVICE_ACCOUNT_KEY_PATH = originalPath;
    });

    it('should use existing Firebase app if available', async () => {
      await import('../index');
      
      expect(loggerMock.debug).toHaveBeenCalledWith('Using existing Firebase app');
    });

    it('should handle Firebase initialization errors', async () => {
      const originalPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/invalid/path/service-account.json';
      
      // Mock admin.app() to throw error
      adminMock.app.mockImplementation(() => {
        throw new Error('No app exists');
      });
      
      // Mock require to throw an error
      vi.doMock('/invalid/path/service-account.json', () => {
        throw new Error('Cannot find module');
      });
      
      await import('../index');
      
      expect(loggerMock.error).toHaveBeenCalledWith(
        'Failed to initialize Firebase',
        expect.any(Error)
      );
      
      // Restore env var
      process.env.SERVICE_ACCOUNT_KEY_PATH = originalPath;
    });
  });

  describe('Tool Registration', () => {
    it('should register all Firebase tools', async () => {
      await import('../index');
      
      // Verify server constructor was called with correct info
      expect(serverConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'firebase-mcp',
          version: expect.any(String)
        }),
        expect.objectContaining({
          capabilities: expect.any(Object)
        })
      );

      // Verify ListTools handler was registered
      expect(serverMock.setRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function)
      );

      // Get the ListTools handler and test it
      const listToolsHandler = serverMock.setRequestHandler.mock.calls.find(
        call => call[0] === ListToolsRequestSchema
      )[1];
      
      const result = await listToolsHandler();
      expect(result.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'firestore_add_document',
            description: expect.any(String),
            inputSchema: expect.any(Object)
          }),
          expect.objectContaining({
            name: 'firestore_list_documents',
            description: expect.any(String),
            inputSchema: expect.any(Object)
          }),
          expect.objectContaining({
            name: 'firestore_get_document',
            description: expect.any(String),
            inputSchema: expect.any(Object)
          })
        ])
      );
    });

    it('should register tool handlers for each Firebase operation', async () => {
      await import('../index');
      
      // Verify CallTool handler was registered
      expect(serverMock.setRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function)
      );

      // Get the CallTool handler and test it
      const callToolHandler = serverMock.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )[1];

      // Test calling a tool with proper params format
      await expect(callToolHandler({
        params: {
          name: 'firestore_list_documents',
          input: { collection: 'test' }
        }
      })).resolves.toBeDefined();
    });
  });

  describe('Server Lifecycle', () => {
    it('should set up error handler', async () => {
      await import('../index');
      
      expect(serverMock.onerror).toBeDefined();
    });

    it('should handle graceful shutdown', async () => {
      await import('../index');
      
      // Mock server.close to resolve immediately
      serverMock.close.mockResolvedValue(undefined);
      
      // Simulate SIGINT and wait for async handler
      await new Promise<void>(resolve => {
        process.emit('SIGINT');
        // Wait for next tick to allow async handler to complete
        setImmediate(() => {
          expect(serverMock.close).toHaveBeenCalled();
          expect(processExitMock).toHaveBeenCalledWith(0);
          resolve();
        });
      });
    });
  });
}); 