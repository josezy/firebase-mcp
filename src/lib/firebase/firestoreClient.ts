/**
 * Firebase Firestore Client
 *
 * This module provides functions for interacting with Firebase Firestore database.
 * It includes operations for listing collections, querying documents, and performing CRUD operations.
 * All functions return data in a format compatible with the MCP protocol response structure.
 *
 * @module firebase-mcp/firestore
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getProjectId } from './firebaseConfig';
import * as admin from 'firebase-admin';

interface FirestoreResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Lists collections in Firestore, either at the root level or under a specific document.
 * Results are paginated and include links to the Firebase console.
 *
 * @param {string} [documentPath] - Optional path to a document to list subcollections
 * @param {number} [_limit=20] - Maximum number of collections to return (currently unused)
 * @param {string} [_pageToken] - Token for pagination (collection ID to start after) (currently unused)
 * @returns {Promise<Object>} MCP-formatted response with collection data
 * @throws {Error} If Firebase is not initialized or if there's a Firestore error
 *
 * @example
 * // List root collections
 * const rootCollections = await list_collections();
 *
 * @example
 * // List subcollections of a document
 * const subCollections = await list_collections('users/user123');
 */
export async function list_collections(
  documentPath?: string,
  _limit: number = 20,
  _pageToken?: string
): Promise<FirestoreResponse> {
  try {
    const collections = documentPath
      ? await admin.firestore().doc(documentPath).listCollections()
      : await admin.firestore().listCollections();

    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
    if (!serviceAccountPath) {
      return {
        content: [{ type: 'error', text: 'Service account path not set' }],
        isError: true,
      };
    }

    const projectId = getProjectId(serviceAccountPath);
    if (!projectId) {
      return {
        content: [{ type: 'error', text: 'Could not determine project ID' }],
        isError: true,
      };
    }

    const collectionList = collections.map(collection => {
      const collectionUrl = `https://console.firebase.google.com/project/${projectId}/firestore/data/${documentPath}/${collection.id}`;
      return {
        id: collection.id,
        path: collection.path,
        url: collectionUrl,
      };
    });

    return {
      content: [{ type: 'json', text: JSON.stringify({ collections: collectionList }) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: errorMessage }],
      isError: true,
    };
  }
}

/**
 * Converts Firestore Timestamp objects to ISO string format for JSON serialization.
 * This is a helper function used internally by other functions.
 *
 * @param data - The data object containing potential Timestamp fields
 * @returns The same data object with Timestamps converted to ISO strings
 * @private
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertTimestampsToISO(data: any) {
  for (const key in data) {
    if (data[key] instanceof Timestamp) {
      data[key] = data[key].toDate().toISOString();
    }
  }
  return data;
}

/**
 * Lists documents in a Firestore collection with optional filtering and pagination.
 * Results include document data, IDs, and links to the Firebase console.
 *
 * @param {string} collection - The collection path to query
 * @param {Array<Object>} [filters=[]] - Array of filter conditions with field, operator, and value
 * @param {number} [limit=20] - Maximum number of documents to return
 * @param {string} [pageToken] - Token for pagination (document ID to start after)
 * @returns {Promise<Object>} MCP-formatted response with document data
 * @throws {Error} If Firebase is not initialized or if there's a Firestore error
 *
 * @example
 * // List all documents in a collection
 * const allDocs = await listDocuments('users');
 *
 * @example
 * // List documents with filtering
 * const filteredDocs = await listDocuments('users', [
 *   { field: 'age', operator: '>=', value: 21 },
 *   { field: 'status', operator: '==', value: 'active' }
 * ]);
 */
export async function listDocuments(
  collection: string,
  filters?: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
  limit: number = 20,
  pageToken?: string
): Promise<FirestoreResponse> {
  try {
    let query: FirebaseFirestore.Query = admin.firestore().collection(collection);

    if (filters) {
      filters.forEach(filter => {
        query = query.where(filter.field, filter.operator, filter.value);
      });
    }

    if (limit) {
      query = query.limit(limit);
    }

    if (pageToken) {
      const lastDoc = await admin.firestore().doc(pageToken).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
    if (!serviceAccountPath) {
      return {
        content: [{ type: 'error', text: 'Service account path not set' }],
        isError: true,
      };
    }

    const projectId = getProjectId(serviceAccountPath);
    if (!projectId) {
      return {
        content: [{ type: 'error', text: 'Could not determine project ID' }],
        isError: true,
      };
    }

    const documents = snapshot.docs.map(doc => {
      const consoleUrl = `https://console.firebase.google.com/project/${projectId}/firestore/data/${collection}/${doc.id}`;
      return {
        id: doc.id,
        data: doc.data(),
        url: consoleUrl,
      };
    });

    const lastVisible = snapshot.docs[snapshot.docs.length - 1];
    const nextPageToken = lastVisible ? lastVisible.ref.path : undefined;

    return {
      content: [{ type: 'json', text: JSON.stringify({ documents, nextPageToken }) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: errorMessage }],
      isError: true,
    };
  }
}

/**
 * Adds a new document to a Firestore collection with auto-generated ID.
 *
 * @param {string} collection - The collection path to add the document to
 * @param {any} data - The document data to add
 * @returns {Promise<Object>} MCP-formatted response with the new document ID and data
 * @throws {Error} If Firebase is not initialized or if there's a Firestore error
 *
 * @example
 * // Add a new user document
 * const result = await addDocument('users', {
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   createdAt: new Date()
 * });
 */
export async function addDocument(collection: string, data: object): Promise<FirestoreResponse> {
  try {
    const docRef = await admin.firestore().collection(collection).add(data);
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
    if (!serviceAccountPath) {
      return {
        content: [{ type: 'error', text: 'Service account path not set' }],
        isError: true,
      };
    }

    const projectId = getProjectId(serviceAccountPath);
    if (!projectId) {
      return {
        content: [{ type: 'error', text: 'Could not determine project ID' }],
        isError: true,
      };
    }

    const consoleUrl = `https://console.firebase.google.com/project/${projectId}/firestore/data/${collection}/${docRef.id}`;

    return {
      content: [{ type: 'json', text: JSON.stringify({ id: docRef.id, url: consoleUrl }) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: errorMessage }],
      isError: true,
    };
  }
}

/**
 * Retrieves a specific document from a Firestore collection by ID.
 *
 * @param {string} collection - The collection path containing the document
 * @param {string} id - The document ID to retrieve
 * @returns {Promise<Object>} MCP-formatted response with the document data
 * @throws {Error} If Firebase is not initialized or if there's a Firestore error
 *
 * @example
 * // Get a specific user document
 * const user = await getDocument('users', 'user123');
 */
export async function getDocument(collection: string, id: string): Promise<FirestoreResponse> {
  try {
    const doc = await admin.firestore().collection(collection).doc(id).get();
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
    if (!serviceAccountPath) {
      return {
        content: [{ type: 'error', text: 'Service account path not set' }],
        isError: true,
      };
    }

    const projectId = getProjectId(serviceAccountPath);
    if (!projectId) {
      return {
        content: [{ type: 'error', text: 'Could not determine project ID' }],
        isError: true,
      };
    }

    if (!doc.exists) {
      return {
        content: [{ type: 'error', text: `Document not found: ${id}` }],
        isError: true,
      };
    }

    const consoleUrl = `https://console.firebase.google.com/project/${projectId}/firestore/data/${collection}/${id}`;

    return {
      content: [
        { type: 'json', text: JSON.stringify({ id: doc.id, data: doc.data(), url: consoleUrl }) },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: errorMessage }],
      isError: true,
    };
  }
}

/**
 * Updates an existing document in a Firestore collection.
 *
 * @param {string} collection - The collection path containing the document
 * @param {string} id - The document ID to update
 * @param {any} data - The document data to update (fields will be merged)
 * @returns {Promise<Object>} MCP-formatted response with the updated document data
 * @throws {Error} If Firebase is not initialized or if there's a Firestore error
 *
 * @example
 * // Update a user's status
 * const result = await updateDocument('users', 'user123', {
 *   status: 'inactive',
 *   lastUpdated: new Date()
 * });
 */
export async function updateDocument(
  collection: string,
  id: string,
  data: object
): Promise<FirestoreResponse> {
  try {
    await admin.firestore().collection(collection).doc(id).update(data);
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
    if (!serviceAccountPath) {
      return {
        content: [{ type: 'error', text: 'Service account path not set' }],
        isError: true,
      };
    }

    const projectId = getProjectId(serviceAccountPath);
    if (!projectId) {
      return {
        content: [{ type: 'error', text: 'Could not determine project ID' }],
        isError: true,
      };
    }

    const consoleUrl = `https://console.firebase.google.com/project/${projectId}/firestore/data/${collection}/${id}`;

    return {
      content: [{ type: 'json', text: JSON.stringify({ success: true, url: consoleUrl }) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: errorMessage }],
      isError: true,
    };
  }
}

/**
 * Deletes a document from a Firestore collection.
 *
 * @param {string} collection - The collection path containing the document
 * @param {string} id - The document ID to delete
 * @returns {Promise<Object>} MCP-formatted response confirming deletion
 * @throws {Error} If Firebase is not initialized or if there's a Firestore error
 *
 * @example
 * // Delete a user document
 * const result = await deleteDocument('users', 'user123');
 */
export async function deleteDocument(collection: string, id: string): Promise<FirestoreResponse> {
  try {
    const docRef = admin.firestore().collection(collection).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return {
        content: [{ type: 'error', text: 'no entity to delete' }],
        isError: true,
      };
    }

    await docRef.delete();
    return {
      content: [{ type: 'json', text: JSON.stringify({ success: true }) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: errorMessage }],
      isError: true,
    };
  }
}

/**
 * Queries across all subcollections with the same name regardless of their parent document.
 * This is useful for searching data across multiple parent documents.
 *
 * @param {string} collectionId - The collection ID to query (without parent path)
 * @param {Array<Object>} [filters=[]] - Array of filter conditions with field, operator, and value
 * @param {Array<Object>} [orderBy=[]] - Array of fields to order results by
 * @param {number} [limit=20] - Maximum number of documents to return
 * @param {string} [pageToken] - Token for pagination (document path to start after)
 * @returns {Promise<Object>} MCP-formatted response with document data
 * @throws {Error} If Firebase is not initialized or if there's a Firestore error
 *
 * @example
 * // Query across all 'comments' subcollections
 * const allComments = await queryCollectionGroup('comments');
 *
 * @example
 * // Query with filtering
 * const filteredComments = await queryCollectionGroup('comments', [
 *   { field: 'rating', operator: '>', value: 3 }
 * ]);
 */
export async function queryCollectionGroup(
  collectionId: string,
  filters?: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
  orderBy?: Array<{ field: string; direction?: 'asc' | 'desc' }>,
  limit: number = 20,
  pageToken?: string
): Promise<FirestoreResponse> {
  try {
    // Use any to bypass TypeScript type check for collectionGroup
    // The Firebase types are sometimes inconsistent between versions
    let query: any = admin.firestore().collectionGroup(collectionId);

    // Apply filters if provided
    if (filters && filters.length > 0) {
      filters.forEach(filter => {
        query = query.where(filter.field, filter.operator, filter.value);
      });
    }

    // Apply ordering if provided
    if (orderBy && orderBy.length > 0) {
      orderBy.forEach(order => {
        query = query.orderBy(order.field, order.direction || 'asc');
      });
    }

    // Apply pagination if pageToken is provided
    if (pageToken) {
      try {
        const lastDoc = await admin.firestore().doc(pageToken).get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'error',
              text: `Invalid pagination token: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Apply limit
    query = query.limit(limit);

    const snapshot = await query.get();
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
    if (!serviceAccountPath) {
      return {
        content: [{ type: 'error', text: 'Service account path not set' }],
        isError: true,
      };
    }

    const projectId = getProjectId(serviceAccountPath);
    if (!projectId) {
      return {
        content: [{ type: 'error', text: 'Could not determine project ID' }],
        isError: true,
      };
    }

    const documents = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      // For collection groups, we need to use the full path for the URL
      const fullPath = doc.ref.path;
      const consoleUrl = `https://console.firebase.google.com/project/${projectId}/firestore/data/${fullPath}`;

      // Handle Timestamp and other Firestore types
      const data = convertTimestampsToISO(doc.data());

      return {
        id: doc.id,
        path: fullPath,
        data,
        url: consoleUrl,
      };
    });

    // Get the last document for pagination
    const lastVisible = snapshot.docs[snapshot.docs.length - 1];
    const nextPageToken = lastVisible ? lastVisible.ref.path : undefined;

    // Ensure we're creating valid JSON by serializing and handling special characters
    const responseObj = { documents, nextPageToken };
    const jsonText = JSON.stringify(responseObj);

    return {
      content: [{ type: 'json', text: jsonText }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: errorMessage }],
      isError: true,
    };
  }
}
