import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  connect: vi.fn(),
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
    ref: { path: `${collection}/${id}`, id },
  }),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({}),
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
    add: vi.fn(data => {
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
      docs: Array.from(docs.values()),
    }),
  };
  return collectionMock;
};

type FirestoreMock = {
  collection: ReturnType<
    typeof vi.fn<[collection: string], ReturnType<typeof createCollectionMock>>
  >;
  listCollections?: ReturnType<typeof vi.fn>;
};

// Declare mock variables
let serverConstructor: any;
let serverMock: ServerMock;
let loggerMock: {
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
};
let processExitMock: ReturnType<typeof vi.fn>;
let adminMock: {
  app: ReturnType<typeof vi.fn<[], App>>;
  credential: { cert: ReturnType<typeof vi.fn> };
  initializeApp: ReturnType<typeof vi.fn>;
  firestore: () => FirestoreMock;
  auth?: () => {
    getUser: ReturnType<typeof vi.fn>;
    getUserByEmail: ReturnType<typeof vi.fn>;
  };
  storage?: () => {
    bucket: ReturnType<typeof vi.fn>;
  };
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
      info: vi.fn(),
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
      app: vi.fn<[], App>(() => ({ name: '[DEFAULT]' }) as App),
      credential: {
        cert: vi.fn(),
      },
      initializeApp: vi.fn(),
      firestore: () => ({
        collection: vi.fn().mockReturnValue(collectionMock),
      }),
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
          version: expect.any(String),
        }),
        expect.objectContaining({
          capabilities: expect.any(Object),
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
            inputSchema: expect.any(Object),
          }),
          expect.objectContaining({
            name: 'firestore_list_documents',
            description: expect.any(String),
            inputSchema: expect.any(Object),
          }),
          expect.objectContaining({
            name: 'firestore_get_document',
            description: expect.any(String),
            inputSchema: expect.any(Object),
          }),
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
      await expect(
        callToolHandler({
          params: {
            name: 'firestore_list_documents',
            arguments: { collection: 'test' },
          },
        })
      ).resolves.toBeDefined();
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
          arguments: { collection: 'test', data: { foo: 'bar' } },
        },
      });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'No app exists',
            }),
          },
        ],
      });
    });

    describe('firestore_add_document', () => {
      it('should add a document to Firestore', async () => {
        // Create collection mock with specific name
        const collectionMock = createCollectionMock('test');
        adminMock.firestore = () => ({
          collection: vi.fn().mockReturnValue(collectionMock),
        });

        const result = await callToolHandler({
          params: {
            name: 'firestore_add_document',
            arguments: {
              collection: 'test',
              data: { foo: 'bar' },
            },
          },
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
            arguments: {
              collection: 'test',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('documents');
        expect(content).toHaveProperty('nextPageToken');
      });

      it('should apply filters and ordering', async () => {
        const result = await callToolHandler({
          params: {
            name: 'firestore_list_documents',
            arguments: {
              collection: 'test',
              filters: [{ field: 'status', operator: '==', value: 'active' }],
              orderBy: [{ field: 'createdAt', direction: 'desc' }],
              limit: 10,
            },
          },
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
          collection: vi.fn().mockReturnValue(collectionMock),
        });

        const result = await callToolHandler({
          params: {
            name: 'firestore_get_document',
            arguments: {
              collection: 'test',
              id: docId,
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual({
          id: docId,
          path: `test/${docId}`,
          data: docData,
        });
      });

      it('should handle non-existent document', async () => {
        // Set up mock for non-existent document
        const docRef = createDocRefMock('test', 'not-found');
        adminMock.firestore().collection('test').doc.mockReturnValue(docRef);

        const result = await callToolHandler({
          params: {
            name: 'firestore_get_document',
            arguments: {
              collection: 'test',
              id: 'not-found',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual({
          error: 'Document not found',
        });
      });
    });

    describe('firestore_update_document', () => {
      it('should update an existing document', async () => {
        // Set up test data
        const testCollection = 'test';
        const testDocId = 'test-doc';
        const updateData = { foo: 'updated' };

        // Create document with update method that properly captures args
        const docRef = createDocRefMock(testCollection, testDocId, { original: 'data' });
        const updateMock = vi.fn().mockResolvedValue({});
        docRef.update = updateMock;

        // Create collection mock with specific name
        const collectionMock = createCollectionMock(testCollection);
        collectionMock.doc.mockReturnValue(docRef);

        // Configure Firestore mock
        adminMock.firestore = () => ({
          collection: vi.fn().mockReturnValue(collectionMock),
        });

        // Execute the handler
        const result = await callToolHandler({
          params: {
            name: 'firestore_update_document',
            arguments: {
              collection: testCollection,
              id: testDocId,
              data: updateData,
            },
          },
        });

        // Verify update was called with correct data
        expect(updateMock).toHaveBeenCalledWith(updateData);

        // Verify response structure
        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual({
          id: testDocId,
          path: `${testCollection}/${testDocId}`,
          updated: true,
        });
      });
    });

    describe('firestore_delete_document', () => {
      it('should delete an existing document', async () => {
        // Set up mock document
        const docId = 'test-doc';
        const docRef = createDocRefMock('test', docId, { foo: 'bar' });

        // Mock delete method
        docRef.delete = vi.fn().mockResolvedValue({});

        // Create collection mock with specific name
        const collectionMock = createCollectionMock('test');
        collectionMock.doc.mockReturnValue(docRef);

        adminMock.firestore = () => ({
          collection: vi.fn().mockReturnValue(collectionMock),
        });

        const result = await callToolHandler({
          params: {
            name: 'firestore_delete_document',
            arguments: {
              collection: 'test',
              id: docId,
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual({
          id: docId,
          path: `test/${docId}`,
          deleted: true,
        });
        expect(docRef.delete).toHaveBeenCalled();
      });

      it('should handle errors during deletion', async () => {
        // Set up mock document with delete error
        const docRef = createDocRefMock('test', 'error-doc', { foo: 'bar' });
        docRef.delete = vi.fn().mockRejectedValue(new Error('Permission denied'));

        adminMock.firestore = () => ({
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue(docRef),
          }),
        });

        const result = await callToolHandler({
          params: {
            name: 'firestore_delete_document',
            arguments: {
              collection: 'test',
              id: 'error-doc',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual({
          error: 'Permission denied',
        });
      });
    });

    describe('auth_get_user', () => {
      it('should get a user by ID', async () => {
        // Create user object that matches what the implementation expects
        const userObj = {
          uid: 'user123',
          email: 'test@example.com',
          displayName: 'Test User',
          emailVerified: false,
          photoURL: null,
          disabled: false,
          metadata: {
            creationTime: '2023-01-01',
            lastSignInTime: '2023-01-02',
          },
        };

        // Create auth mock with properly implemented methods
        const authInstance = {
          getUser: vi.fn().mockResolvedValue(userObj),
          getUserByEmail: vi.fn().mockRejectedValue(new Error('User not found')),
        };

        // Important: Set up admin mock with our authInstance BEFORE the test runs
        adminMock.auth = vi.fn().mockReturnValue(authInstance);

        // Run the handler with a non-email identifier
        const result = await callToolHandler({
          params: {
            name: 'auth_get_user',
            arguments: {
              identifier: 'user123',
            },
          },
        });

        // Verify the correct method was called
        expect(authInstance.getUser).toHaveBeenCalledWith('user123');
        expect(authInstance.getUserByEmail).not.toHaveBeenCalled();

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('user');
        expect(content.user).toEqual(
          expect.objectContaining({
            uid: 'user123',
            email: 'test@example.com',
            displayName: 'Test User',
          })
        );
      });

      it('should get a user by email', async () => {
        // Create user object that matches what the implementation expects
        const userObj = {
          uid: 'user123',
          email: 'test@example.com',
          displayName: 'Test User',
          emailVerified: false,
          photoURL: null,
          disabled: false,
          metadata: {
            creationTime: '2023-01-01',
            lastSignInTime: '2023-01-02',
          },
        };

        // Create auth mock with properly implemented methods
        const authInstance = {
          getUser: vi.fn().mockRejectedValue(new Error('User not found')),
          getUserByEmail: vi.fn().mockResolvedValue(userObj),
        };

        // Important: Set up admin mock with our authInstance BEFORE the test runs
        adminMock.auth = vi.fn().mockReturnValue(authInstance);

        // Run the handler with an email identifier
        const result = await callToolHandler({
          params: {
            name: 'auth_get_user',
            arguments: {
              identifier: 'test@example.com',
            },
          },
        });

        // Verify the correct method was called
        expect(authInstance.getUserByEmail).toHaveBeenCalledWith('test@example.com');
        expect(authInstance.getUser).not.toHaveBeenCalled();

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('user');
        expect(content.user).toEqual(
          expect.objectContaining({
            uid: 'user123',
            email: 'test@example.com',
            displayName: 'Test User',
          })
        );
      });

      it('should handle user not found', async () => {
        // Mock auth method with error
        const authMock = {
          getUser: vi.fn().mockRejectedValue(new Error('User not found')),
          getUserByEmail: vi.fn().mockRejectedValue(new Error('User not found')),
        };

        adminMock.auth = vi.fn().mockReturnValue(authMock);

        const result = await callToolHandler({
          params: {
            name: 'auth_get_user',
            arguments: {
              identifier: 'nonexistent',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual(
          expect.objectContaining({
            error: 'User not found',
            details: expect.any(String),
          })
        );
      });

      it('should handle authentication errors properly', async () => {
        // Mock auth with custom error types
        const authInstance = {
          getUser: vi.fn().mockRejectedValue(new Error('Invalid auth token')),
          getUserByEmail: vi.fn().mockRejectedValue(new Error('Invalid auth token')),
        };

        adminMock.auth = vi.fn().mockReturnValue(authInstance);

        const result = await callToolHandler({
          params: {
            name: 'auth_get_user',
            arguments: {
              identifier: 'user123',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('error', 'User not found');
        expect(content).toHaveProperty('details', 'Invalid auth token');
      });
    });

    describe('storage_list_files', () => {
      it('should list files in storage', async () => {
        // Mock storage bucket and list files response
        const storageMock = {
          bucket: vi.fn().mockReturnValue({
            getFiles: vi.fn().mockResolvedValue([
              [
                { name: 'file1.txt', metadata: { updated: '2023-01-01' } },
                { name: 'file2.txt', metadata: { updated: '2023-01-02' } },
              ],
            ]),
          }),
        };

        adminMock.storage = vi.fn().mockReturnValue(storageMock);

        const result = await callToolHandler({
          params: {
            name: 'storage_list_files',
            arguments: {
              directoryPath: 'test-folder',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content.files).toHaveLength(2);
        expect(content.files[0].name).toBe('file1.txt');
        expect(content.files[0].updated).toBe('2023-01-01');
        expect(content.files[1].name).toBe('file2.txt');
        expect(content.files[1].updated).toBe('2023-01-02');
        expect(storageMock.bucket).toHaveBeenCalled();
      });

      it('should handle empty directory', async () => {
        // Mock storage bucket with empty list
        const storageMock = {
          bucket: vi.fn().mockReturnValue({
            getFiles: vi.fn().mockResolvedValue([[]]),
          }),
        };

        adminMock.storage = vi.fn().mockReturnValue(storageMock);

        const result = await callToolHandler({
          params: {
            name: 'storage_list_files',
            arguments: {
              directoryPath: 'empty-folder',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual({
          files: [],
        });
      });

      it('should handle storage errors', async () => {
        // Mock storage bucket with error
        const storageMock = {
          bucket: vi.fn().mockReturnValue({
            getFiles: vi.fn().mockRejectedValue(new Error('Access denied')),
          }),
        };

        adminMock.storage = vi.fn().mockReturnValue(storageMock);

        const result = await callToolHandler({
          params: {
            name: 'storage_list_files',
            arguments: {
              directoryPath: 'forbidden-folder',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual(
          expect.objectContaining({
            error: 'Failed to list files',
            details: 'Access denied',
          })
        );
      });

      it('should handle missing bucket name', async () => {
        // Mock storage.bucket with null name
        const storageMock = {
          bucket: vi.fn().mockReturnValue({
            name: null, // Missing bucket name
            getFiles: vi.fn().mockResolvedValue([[{ name: 'file1.txt', metadata: { size: 100 } }]]),
          }),
        };

        adminMock.storage = vi.fn().mockReturnValue(storageMock);

        const result = await callToolHandler({
          params: {
            name: 'storage_list_files',
            arguments: {},
          },
        });

        // The function should still work even with null bucket name
        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('files');
        expect(content.files[0]).toHaveProperty('name', 'file1.txt');
      });

      it('should handle files with missing metadata', async () => {
        // Mock storage with files that have missing or unusual metadata
        const storageMock = {
          bucket: vi.fn().mockReturnValue({
            name: 'test-bucket',
            getFiles: vi.fn().mockResolvedValue([
              [
                // File with missing metadata fields
                { name: 'file1.txt', metadata: {} },
                // File with unusual metadata types
                {
                  name: 'file2.txt',
                  metadata: {
                    size: new Date(), // Non-string size
                    contentType: null,
                    updated: undefined,
                    md5Hash: 123456, // Number instead of string
                  },
                },
              ],
            ]),
          }),
        };

        adminMock.storage = vi.fn().mockReturnValue(storageMock);

        const result = await callToolHandler({
          params: {
            name: 'storage_list_files',
            arguments: {},
          },
        });

        // Function should handle these edge cases gracefully
        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('files');
        expect(content.files).toHaveLength(2);
      });
    });

    describe('storage_get_file_info', () => {
      it('should get file information', async () => {
        // Mock file metadata and download URL
        const fileMock = {
          exists: vi.fn().mockResolvedValue([true]),
          getMetadata: vi.fn().mockResolvedValue([
            {
              name: 'test.txt',
              contentType: 'text/plain',
              size: '1024',
              updated: '2023-01-01',
            },
          ]),
          getSignedUrl: vi.fn().mockResolvedValue(['https://example.com/download-url']),
        };

        const storageMock = {
          bucket: vi.fn().mockReturnValue({
            file: vi.fn().mockReturnValue(fileMock),
          }),
        };

        adminMock.storage = vi.fn().mockReturnValue(storageMock);

        const result = await callToolHandler({
          params: {
            name: 'storage_get_file_info',
            arguments: {
              filePath: 'test.txt',
            },
          },
        });

        expect(result).toBeDefined();
        expect(fileMock.getMetadata).toHaveBeenCalled();
        expect(fileMock.getSignedUrl).toHaveBeenCalled();
      });

      it('should handle file not found', async () => {
        // Mock file not found error
        const fileMock = {
          exists: vi.fn().mockResolvedValue([false]),
          getMetadata: vi.fn().mockRejectedValue(new Error('File not found')),
        };

        const storageMock = {
          bucket: vi.fn().mockReturnValue({
            file: vi.fn().mockReturnValue(fileMock),
          }),
        };

        adminMock.storage = vi.fn().mockReturnValue(storageMock);

        const result = await callToolHandler({
          params: {
            name: 'storage_get_file_info',
            arguments: {
              filePath: 'nonexistent.txt',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual(
          expect.objectContaining({
            error: expect.stringContaining('Failed to get file info'),
          })
        );
      });
    });

    describe('firestore_list_collections', () => {
      it('should list Firestore collections', async () => {
        // Mock listCollections method
        const firestoreMock = {
          listCollections: vi
            .fn()
            .mockResolvedValue([{ id: 'users' }, { id: 'products' }, { id: 'orders' }]),
        };

        adminMock.firestore = vi.fn().mockReturnValue(firestoreMock);

        const result = await callToolHandler({
          params: {
            name: 'firestore_list_collections',
            arguments: {
              random_string: 'any_value',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('collections');
        expect(content.collections).toHaveLength(3);
        expect(content.collections[0]).toEqual({ id: 'users' });
        expect(content.collections[1]).toEqual({ id: 'products' });
        expect(content.collections[2]).toEqual({ id: 'orders' });
        expect(firestoreMock.listCollections).toHaveBeenCalled();
      });

      it('should handle errors', async () => {
        // Mock listCollections with error
        const firestoreMock = {
          listCollections: vi.fn().mockRejectedValue(new Error('Permission denied')),
        };

        adminMock.firestore = vi.fn().mockReturnValue(firestoreMock);

        const result = await callToolHandler({
          params: {
            name: 'firestore_list_collections',
            arguments: {
              random_string: 'any_value',
            },
          },
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toEqual({
          error: 'Permission denied',
        });
      });
    });

    it('should handle Firebase index errors', async () => {
      // Create a mock error that simulates Firebase's "requires an index" error
      const indexError = new Error(
        'FAILED_PRECONDITION: The query requires an index. ' +
          'You can create it here: https://console.firebase.google.com/project/test-project/database/firestore/indexes'
      );

      // Mock the collection to throw this specific error
      const collectionMock = createCollectionMock('test');
      collectionMock.get.mockRejectedValue(indexError);

      adminMock.firestore = () => ({
        collection: vi.fn().mockReturnValue(collectionMock),
      });

      const result = await callToolHandler({
        params: {
          name: 'firestore_list_documents',
          arguments: {
            collection: 'test',
            filters: [{ field: 'status', operator: '==', value: 'active' }],
            orderBy: [{ field: 'createdAt', direction: 'desc' }],
          },
        },
      });

      const content = JSON.parse(result.content[0].text);
      expect(content).toHaveProperty('error', 'This query requires a composite index.');
      expect(content).toHaveProperty('details');
      expect(content).toHaveProperty('indexUrl');
      expect(content.indexUrl).toContain('console.firebase.google.com');
    });

    describe('firestore_get_document', () => {
      it('should sanitize document data with various types', async () => {
        // Create mock document with complex data types
        const docId = 'complex-data-doc';
        const mockDate = new Date('2023-01-01');
        const complexData = {
          string: 'text value',
          number: 123,
          boolean: true,
          null: null,
          date: mockDate,
          array: [1, 2, 3],
          nestedObject: { foo: 'bar' },
          unusualType: Symbol('test'),
          undefinedValue: undefined,
        };

        const docRef = createDocRefMock('test', docId, complexData);

        // Create collection mock
        const collectionMock = createCollectionMock('test');
        collectionMock.doc.mockReturnValue(docRef);

        adminMock.firestore = () => ({
          collection: vi.fn().mockReturnValue(collectionMock),
        });

        const result = await callToolHandler({
          params: {
            name: 'firestore_get_document',
            arguments: {
              collection: 'test',
              id: docId,
            },
          },
        });

        // Verify data sanitization worked correctly
        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveProperty('data');
        expect(content.data.string).toBe('text value');
        expect(content.data.number).toBe(123);
        expect(content.data.boolean).toBe(true);
        expect(content.data.null).toBe(null);
        expect(content.data.date).toBe(mockDate.toISOString());
        expect(content.data.array).toBe('[1, 2, 3]');
        expect(content.data.nestedObject).toBe('[Object]');
        expect(typeof content.data.unusualType).toBe('string');
      });
    });
  });
});
