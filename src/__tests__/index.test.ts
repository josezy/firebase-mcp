import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';

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

// Mock Firestore document reference
const createDocRefMock = (collection: string, id: string, data?: any) => ({
  id,
  path: `${collection}/${id}`,
  get: vi.fn().mockResolvedValue({
    exists: !!data,
    data: () => data,
    id,
    ref: { path: `${collection}/${id}`, id }
  })
});

// Mock Firestore collection reference
const createCollectionMock = (collectionName: string) => {
  const docs = new Map();
  const collectionMock = {
    doc: vi.fn((id: string) => {
      if (!docs.has(id)) {
        docs.set(id, createDocRefMock(collectionName, id));
      }
      return docs.get(id);
    }),
    add: vi.fn((data) => {
      const id = Math.random().toString(36).substring(7);
      const docRef = createDocRefMock(collectionName, id, data);
      docs.set(id, docRef);
      return Promise.resolve(docRef);
    }),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    startAfter: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({
      docs: Array.from(docs.values())
    })
  };
  return collectionMock;
};

type FirestoreMock = {
  collection: ReturnType<typeof vi.fn<[collection: string], ReturnType<typeof createCollectionMock>>>;
};

// Declare mock variables
let serverConstructor: any;
let serverMock: ServerMock;
let loggerMock: { error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
let processExitMock: ReturnType<typeof vi.fn>;
let adminMock: {
  app: ReturnType<typeof vi.fn<[], App>>;
  credential: { cert: ReturnType<typeof vi.fn> };
  initializeApp: ReturnType<typeof vi.fn>;
  firestore: () => FirestoreMock;
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

    // Create admin mock with Firestore
    const collectionMock = createCollectionMock('test');
    adminMock = {
      app: vi.fn<[], App>(() => ({ name: '[DEFAULT]' } as App)),
      credential: {
        cert: vi.fn()
      },
      initializeApp: vi.fn(),
      firestore: () => ({
        collection: vi.fn().mockReturnValue(collectionMock)
      })
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

  describe('Tool Execution', () => {
    let callToolHandler: Function;

    beforeEach(async () => {
      await import('../index');
      callToolHandler = serverMock.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )[1];
    });

    it('should handle uninitialized Firebase', async () => {
      // Force app to be null and firestore to throw
      adminMock.app.mockImplementation(() => {
        throw new Error('No app exists');
      });
      adminMock.firestore = () => {
        throw new Error('No app exists');
      };

      // Re-import to get null app
      vi.resetModules();
      
      // Set up mocks again
      vi.doMock('@modelcontextprotocol/sdk/server/index.js', () => ({ Server: serverConstructor }));
      vi.doMock('../utils/logger', () => ({ logger: loggerMock }));
      vi.doMock('firebase-admin', () => adminMock);
      
      await import('../index');

      // Get the new handler after re-importing
      callToolHandler = serverMock.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )[1];

      const result = await callToolHandler({
        params: {
          name: 'firestore_add_document',
          input: { collection: 'test', data: { foo: 'bar' } }
        }
      });

      expect(result).toEqual({
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'No app exists'
          })
        }]
      });
    });

    describe('firestore_add_document', () => {
      it('should add a document to Firestore', async () => {
        // Create collection mock with specific name
        const collectionMock = createCollectionMock('test');
        adminMock.firestore = () => ({
          collection: vi.fn().mockReturnValue(collectionMock)
        });

        const result = await callToolHandler({
          params: {
            name: 'firestore_add_document',
            input: {
              collection: 'test',
              data: { foo: 'bar' }
            }
          }
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('id');
        expect(content).toHaveProperty('path');
        expect(content.path).toContain('test/');
      });
    });

    describe('firestore_list_documents', () => {
      it('should list documents with default options', async () => {
        const result = await callToolHandler({
          params: {
            name: 'firestore_list_documents',
            input: {
              collection: 'test'
            }
          }
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('documents');
        expect(content).toHaveProperty('nextPageToken');
      });

      it('should apply filters and ordering', async () => {
        const result = await callToolHandler({
          params: {
            name: 'firestore_list_documents',
            input: {
              collection: 'test',
              filters: [
                { field: 'status', operator: '==', value: 'active' }
              ],
              orderBy: [
                { field: 'createdAt', direction: 'desc' }
              ],
              limit: 10
            }
          }
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('documents');
        expect(content).toHaveProperty('nextPageToken');
      });
    });

    describe('firestore_get_document', () => {
      it('should get an existing document', async () => {
        // Set up mock document
        const docId = 'test-doc';
        const docData = { foo: 'bar' };
        const docRef = createDocRefMock('test', docId, docData);
        
        // Create collection mock with specific name
        const collectionMock = createCollectionMock('test');
        collectionMock.doc.mockReturnValue(docRef);
        
        adminMock.firestore = () => ({
          collection: vi.fn().mockReturnValue(collectionMock)
        });

        const result = await callToolHandler({
          params: {
            name: 'firestore_get_document',
            input: {
              collection: 'test',
              id: docId
            }
          }
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual({
          id: docId,
          path: `test/${docId}`,
          data: docData
        });
      });

      it('should handle non-existent document', async () => {
        // Set up mock for non-existent document
        const docRef = createDocRefMock('test', 'not-found');
        adminMock.firestore().collection('test').doc.mockReturnValue(docRef);

        const result = await callToolHandler({
          params: {
            name: 'firestore_get_document',
            input: {
              collection: 'test',
              id: 'not-found'
            }
          }
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual({
          error: 'Document not found'
        });
      });
    });
  });
}); 