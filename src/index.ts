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

// Initialize Firebase
function initializeFirebase() {
  try {
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
    if (!serviceAccountPath) {
      return null;
    }

    try {
      const existingApp = admin.app();
      if (existingApp) {
        return existingApp;
      }
    } catch (error) {
      // No existing app, continue with initialization
    }

    const serviceAccount = require(serviceAccountPath);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
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
              text: 'Firebase initialization failed'
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
        return {
          result: errorMessage,
          isError: true
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
