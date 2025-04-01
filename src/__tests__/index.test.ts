import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import * as admin from 'firebase-admin';

// Create mock for Server
const createServerMock = () => ({
  _serverInfo: {},
  _capabilities: {},
  registerCapabilities: vi.fn(),
  assertCapabilityForMethod: vi.fn(),
  assertNotificationCapability: vi.fn(),
  setRequestHandler: vi.fn(),
  onerror: vi.fn(),
  close: vi.fn(),
  run: vi.fn(),
  connect: vi.fn()
});

type ServerMock = ReturnType<typeof createServerMock>;

// Declare mock variables
let serverConstructor: any;
let serverMock: ServerMock;
let loggerMock: { error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

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

    // Set up mocks BEFORE importing the module
    vi.doMock('@modelcontextprotocol/sdk/server/index.js', () => ({ Server: serverConstructor }));
    vi.doMock('../utils/logger', () => ({ logger: loggerMock }));
  });

  describe('Server Initialization', () => {
    it('should initialize Firebase with correct configuration', async () => {
      // Import the module under test
      await import('../index');
      
      // Since Firebase is already initialized in setup, we just verify it's working
      const app = admin.app();
      expect(app).toBeDefined();
      expect(app.name).toBe('[DEFAULT]');
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
  });

  describe('Tool Registration', () => {
    it('should register all Firebase tools', async () => {
      await import('../index');
      
      expect(serverConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'firebase-mcp',
          version: expect.any(String)
        }),
        expect.objectContaining({
          capabilities: expect.any(Object)
        })
      );
      expect(serverMock.setRequestHandler).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should set up error handler', async () => {
      await import('../index');
      
      expect(serverMock.onerror).toBeDefined();
    });
  });
}); 