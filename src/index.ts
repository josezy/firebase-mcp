#!/usr/bin/env node

/**
 * Firebase MCP Server
 * 
 * This server implements the Model Context Protocol (MCP) for Firebase services.
 * It provides tools for interacting with Firebase Authentication, Firestore, and Storage
 * through a standardized interface that can be used by AI assistants and other MCP clients.
 * 
 * @module firebase-mcp
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as admin from 'firebase-admin';
import { logger } from './utils/logger.js';

// Initialize Firebase
function initializeFirebase() {
  try {
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
    if (!serviceAccountPath) {
      logger.error('SERVICE_ACCOUNT_KEY_PATH not set');
      return null;
    }

    try {
      const existingApp = admin.app();
      if (existingApp) {
        logger.debug('Using existing Firebase app');
        return existingApp;
      }
    } catch (error) {
      // No existing app, continue with initialization
      logger.debug('No existing Firebase app, initializing new one');
    }

    const serviceAccount = require(serviceAccountPath);
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    logger.debug(`Initializing Firebase with storage bucket: ${storageBucket}`);

    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: storageBucket
    });
  } catch (error) {
    logger.error('Failed to initialize Firebase', error);
    return null;
  }
}

// Initialize Firebase
const app = initializeFirebase();

interface McpResponse {
  content: Array<{ type: string, text: string }>;
  isError?: boolean;
}

/**
 * Main server class that implements the MCP protocol for Firebase services.
 * Handles tool registration, request routing, and server lifecycle.
 */
class FirebaseMcpServer {
  /** The MCP server instance */
  private server: Server;

  /**
   * Initializes the Firebase MCP server with configuration and event handlers.
   */
  constructor() {
    this.server = new Server(
      {
        name: 'firebase-mcp',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();

    // Set up error handling and graceful shutdown
    this.server.onerror = () => {};
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Registers all available Firebase tools with the MCP server.
   * This includes tools for Firestore, Authentication, and Storage operations.
   * @private
   */
  private setupToolHandlers() {
    // Register available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'firestore_add_document',
          description: 'Add a document to a Firestore collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name'
              },
              data: {
                type: 'object',
                description: 'Document data'
              }
            },
            required: ['collection', 'data']
          }
        },
        {
          name: 'firestore_list_documents',
          description: 'List documents from a Firestore collection with filtering and ordering',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name'
              },
              filters: {
                type: 'array',
                description: 'Array of filter conditions',
                items: {
                  type: 'object',
                  properties: {
                    field: {
                      type: 'string',
                      description: 'Field name to filter'
                    },
                    operator: {
                      type: 'string',
                      description: 'Comparison operator (==, >, <, >=, <=, array-contains, in, array-contains-any)'
                    },
                    value: {
                      description: 'Value to compare against (use ISO format for dates)'
                    }
                  },
                  required: ['field', 'operator', 'value']
                }
              },
              limit: {
                type: 'number',
                description: 'Number of documents to return',
                default: 20
              },
              pageToken: {
                type: 'string',
                description: 'Token for pagination to get the next page of results'
              },
              orderBy: {
                type: 'array',
                description: 'Array of fields to order by',
                items: {
                  type: 'object',
                  properties: {
                    field: {
                      type: 'string',
                      description: 'Field name to order by'
                    },
                    direction: {
                      type: 'string',
                      description: 'Sort direction (asc or desc)',
                      enum: ['asc', 'desc'],
                      default: 'asc'
                    }
                  },
                  required: ['field']
                }
              }
            },
            required: ['collection']
          }
        },
        {
          name: 'firestore_get_document',
          description: 'Get a document from a Firestore collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name'
              },
              id: {
                type: 'string',
                description: 'Document ID'
              }
            },
            required: ['collection', 'id']
          }
        },
        {
          name: 'firestore_update_document',
          description: 'Update a document in a Firestore collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name'
              },
              id: {
                type: 'string',
                description: 'Document ID'
              },
              data: {
                type: 'object',
                description: 'Updated document data'
              }
            },
            required: ['collection', 'id', 'data']
          }
        },
        {
          name: 'firestore_delete_document',
          description: 'Delete a document from a Firestore collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name'
              },
              id: {
                type: 'string',
                description: 'Document ID'
              }
            },
            required: ['collection', 'id']
          }
        },
        {
          name: 'auth_get_user',
          description: 'Get a user by ID or email from Firebase Authentication',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: {
                type: 'string',
                description: 'User ID or email address'
              }
            },
            required: ['identifier']
          }
        },
        {
          name: 'storage_list_files',
          description: 'List files in a given path in Firebase Storage',
          inputSchema: {
            type: 'object',
            properties: {
              directoryPath: {
                type: 'string',
                description: 'The optional path to list files from. If not provided, the root is used.'
              }
            },
            required: []
          }
        },
        {
          name: 'storage_get_file_info',
          description: 'Get file information including metadata and download URL',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'The path of the file to get information for'
              }
            },
            required: ['filePath']
          }
        },
        {
          name: 'firestore_list_collections',
          description: 'List root collections in Firestore',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      ]
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      try {
        if (!app) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Firebase initialization failed'
              })
            }]
          };
        }

        switch (name) {
          case 'firestore_add_document': {
            const collection = args.collection as string;
            const data = args.data as Record<string, any>;
            const docRef = await admin.firestore().collection(collection).add(data);
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  id: docRef.id,
                  path: docRef.path
                })
              }]
            };
          }

          case 'firestore_list_documents': {
            const collection = args.collection as string;
            const limit = Math.min(Math.max(1, (args.limit as number) || 20), 100); // Default 20, max 100
            
            let query: admin.firestore.Query = admin.firestore().collection(collection);

            // Apply filters if provided
            const filters = args.filters as Array<{
              field: string;
              operator: admin.firestore.WhereFilterOp;
              value: any;
            }> | undefined;

            if (filters && filters.length > 0) {
              filters.forEach(filter => {
                query = query.where(filter.field, filter.operator, filter.value);
              });
            }

            // Apply ordering if provided
            const orderBy = args.orderBy as Array<{
              field: string;
              direction?: 'asc' | 'desc';
            }> | undefined;

            if (orderBy && orderBy.length > 0) {
              orderBy.forEach(order => {
                query = query.orderBy(order.field, order.direction || 'asc');
              });
            }

            // Apply pagination if pageToken is provided
            const pageToken = args.pageToken as string | undefined;
            if (pageToken) {
              const lastDoc = await admin.firestore().doc(pageToken).get();
              if (lastDoc.exists) {
                query = query.startAfter(lastDoc);
              }
            }
            
            // Apply limit
            query = query.limit(limit);
            
            const snapshot = await query.get();
            const documents = snapshot.docs.map(doc => {
              const rawData = doc.data();
              // Sanitize data to ensure it's JSON-serializable
              const data = Object.entries(rawData).reduce((acc, [key, value]) => {
                // Handle basic types directly
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
                  acc[key] = value;
                }
                // Convert Date objects to ISO strings
                else if (value instanceof Date) {
                  acc[key] = value.toISOString();
                }
                // Convert arrays to strings
                else if (Array.isArray(value)) {
                  acc[key] = `[${value.join(', ')}]`;
                }
                // Convert other objects to string representation
                else if (typeof value === 'object') {
                  acc[key] = '[Object]';
                }
                // Convert other types to strings
                else {
                  acc[key] = String(value);
                }
                return acc;
              }, {} as Record<string, any>);

              return {
                id: doc.id,
                path: doc.ref.path,
                data
              };
            });

            // Get the last document for pagination
            const lastVisible = snapshot.docs[snapshot.docs.length - 1];
            const nextPageToken = lastVisible ? lastVisible.ref.path : null;
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  documents,
                  nextPageToken
                })
              }]
            };
          }

          case 'firestore_get_document': {
            const collection = args.collection as string;
            const id = args.id as string;
            
            const docRef = admin.firestore().collection(collection).doc(id);
            const doc = await docRef.get();
            
            if (!doc.exists) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Document not found'
                  })
                }]
              };
            }

            const rawData = doc.data();
            // Sanitize data to ensure it's JSON-serializable
            const data = Object.entries(rawData || {}).reduce((acc, [key, value]) => {
              if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
                acc[key] = value;
              } else if (value instanceof Date) {
                acc[key] = value.toISOString();
              } else if (Array.isArray(value)) {
                acc[key] = `[${value.join(', ')}]`;
              } else if (typeof value === 'object') {
                acc[key] = '[Object]';
              } else {
                acc[key] = String(value);
              }
              return acc;
            }, {} as Record<string, any>);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  id: doc.id,
                  path: doc.ref.path,
                  data
                })
              }]
            };
          }

          case 'firestore_update_document': {
            const collection = args.collection as string;
            const id = args.id as string;
            const data = args.data as Record<string, any>;
            
            const docRef = admin.firestore().collection(collection).doc(id);
            await docRef.update(data);
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  id,
                  path: docRef.path,
                  updated: true
                })
              }]
            };
          }

          case 'firestore_delete_document': {
            const collection = args.collection as string;
            const id = args.id as string;
            
            const docRef = admin.firestore().collection(collection).doc(id);
            await docRef.delete();
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  id,
                  path: docRef.path,
                  deleted: true
                })
              }]
            };
          }

          case 'auth_get_user': {
            const identifier = args.identifier as string;
            
            try {
              let user;
              // Try to get user by email first
              if (identifier.includes('@')) {
                const userByEmail = await admin.auth().getUserByEmail(identifier);
                user = userByEmail;
              } else {
                // If not an email, try by UID
                const userById = await admin.auth().getUser(identifier);
                user = userById;
              }

              // Sanitize user data to ensure it's JSON-serializable
              const sanitizedUser = {
                uid: user.uid,
                email: user.email,
                emailVerified: user.emailVerified,
                displayName: user.displayName,
                photoURL: user.photoURL,
                disabled: user.disabled,
                metadata: {
                  creationTime: user.metadata.creationTime,
                  lastSignInTime: user.metadata.lastSignInTime
                }
              };

              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ user: sanitizedUser })
                }]
              };
            } catch (error) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'User not found',
                    details: error instanceof Error ? error.message : 'Unknown error'
                  })
                }]
              };
            }
          }

          case 'storage_list_files': {
            const directoryPath = (args.directoryPath as string) || '';
            
            try {
              logger.debug(`Listing files in directory: ${directoryPath}`);
              const bucket = admin.storage().bucket();
              logger.debug(`Got bucket reference: ${bucket.name}`);

              const [files] = await bucket.getFiles({
                prefix: directoryPath,
                delimiter: '/'
              });

              logger.debug(`Found ${files.length} files`);

              const fileList = files.map(file => ({
                name: file.name,
                size: file.metadata.size ? file.metadata.size : '0',
                contentType: file.metadata.contentType || null,
                updated: file.metadata.updated || null,
                md5Hash: file.metadata.md5Hash || null
              }));

              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ files: fileList }, null, 2)
                }]
              };
            } catch (error) {
              logger.error('Failed to list files', error);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Failed to list files',
                    details: error instanceof Error ? error.message : 'Unknown error'
                  })
                }]
              };
            }
          }

          case 'storage_get_file_info': {
            const filePath = args.filePath as string;
            
            try {
              logger.debug(`Getting info for file: ${filePath}`);
              const bucket = admin.storage().bucket();
              logger.debug(`Got bucket reference: ${bucket.name}`);
              
              const file = bucket.file(filePath);
              const [exists] = await file.exists();
              
              if (!exists) {
                logger.warn(`File not found: ${filePath}`);
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: 'File not found'
                    }, null, 2)
                  }]
                };
              }

              logger.debug('File exists, getting metadata and signed URL');
              const [metadata] = await file.getMetadata();
              const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 15 * 60 * 1000 // URL expires in 15 minutes
              });

              const fileInfo = {
                name: file.name,
                bucket: file.bucket.name,
                size: metadata.size || '0',
                contentType: metadata.contentType || null,
                updated: metadata.updated || null,
                md5Hash: metadata.md5Hash || null,
                downloadUrl: url
              };

              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify(fileInfo, null, 2)
                }]
              };
            } catch (error) {
              logger.error('Failed to get file info', error);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Failed to get file info',
                    details: error instanceof Error ? error.message : 'Unknown error'
                  })
                }]
              };
            }
          }

          case 'firestore_list_collections':
            const collections = await admin.firestore().listCollections();
            const collectionList = collections.map(collection => ({
              id: collection.id,
              path: collection.path
            }));
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ collections: collectionList })
              }]
            };

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Check if it's an index error and extract the index creation URL
        if (errorMessage.includes('FAILED_PRECONDITION') && errorMessage.includes('requires an index')) {
          const indexUrl = errorMessage.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'This query requires a composite index.',
                details: 'When ordering by multiple fields or combining filters with ordering, you need to create a composite index.',
                indexUrl: indexUrl || null
              })
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: errorMessage
            })
          }]
        };
      }
    });
  }

  /**
   * Starts the MCP server using stdio transport.
   * This method connects the server to stdin/stdout for communication with MCP clients.
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Create and start the server
const server = new FirebaseMcpServer();
server.run();
