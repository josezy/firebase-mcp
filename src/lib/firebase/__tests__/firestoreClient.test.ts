import { getDocument, updateDocument, deleteDocument, addDocument, listDocuments, list_collections } from '../firestoreClient';
import { admin } from '../firebaseConfig';
import { logger } from '../../../utils/logger';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Test imports for mocking
import * as firebaseConfig from '../firebaseConfig';

/**
 * Firestore Client Tests
 * 
 * These tests verify the functionality of the Firestore client operations.
 * Tests run against the Firebase emulator when available.
 */

// Test collection and document data
const testCollection = 'test_collection';
const testDocId = 'test-doc-id';
const testData = {
  name: 'Test Document',
  timestamp: new Date().toISOString().split('T')[0]
};

// Helper function to ensure test document exists
async function ensureTestDocument() {
  try {
    const docRef = admin.firestore().collection(testCollection).doc(testDocId);
    await docRef.set(testData);
    logger.debug('Test document created/updated:', testDocId);
  } catch (error) {
    logger.error('Error ensuring test document exists:', error);
  }
}

// Helper function to delete test document
async function deleteTestDocument() {
  try {
    await admin.firestore().collection(testCollection).doc(testDocId).delete();
    logger.debug('Test document deleted:', testDocId);
  } catch (error) {
    // Ignore errors if document doesn't exist
  }
}

// Set up test environment
beforeAll(async () => {
  // Ensure we're using the emulator in test mode
  if (process.env.USE_FIREBASE_EMULATOR === 'true') {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    logger.debug('Using Firestore emulator');
  }
  
  await ensureTestDocument();
});

// Clean up after tests
afterAll(async () => {
  await deleteTestDocument();
});

// Reset mocks between tests
beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Firestore Client', () => {
  describe('getDocument', () => {
    // Test getting an existing document
    it('should return document data when valid ID is provided', async () => {
      const result = await getDocument(testCollection, testDocId);
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      
      // Parse the response
      const responseData = JSON.parse(result.content[0].text);
      
      // Verify document data structure
      expect(responseData.id).toBe(testDocId);
      expect(responseData.data).toEqual(testData);
      expect(responseData.url).toBeDefined();
    });

    // Test error handling for non-existent document
    it('should handle non-existent document gracefully', async () => {
      const result = await getDocument(testCollection, 'non-existent-doc');
      
      // Verify error response
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Document not found: non-existent-doc');
    });

    // Test error handling when getProjectId returns null
    it('should handle null project ID gracefully', async () => {
      // Save service account path to restore later
      const originalPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
      
      try {
        // Mock getProjectId to return null for this test only
        vi.spyOn(firebaseConfig, 'getProjectId').mockReturnValue(null);
        
        // Set service account path to ensure code path is executed
        process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/service-account.json';
        
        // Call the function
        const result = await getDocument(testCollection, testDocId);
        
        // Verify error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Could not determine project ID');
      } finally {
        // Restore service account path
        process.env.SERVICE_ACCOUNT_KEY_PATH = originalPath;
      }
    });
  });

  describe('addDocument', () => {
    // Test adding a new document
    it('should add a document and return its ID', async () => {
      const newDocData = {
        name: 'New Test Document',
        timestamp: new Date().toISOString().split('T')[0]
      };

      const result = await addDocument(testCollection, newDocData);
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      
      // Parse the response
      const responseData = JSON.parse(result.content[0].text);
      
      // Verify document data structure
      expect(responseData.id).toBeDefined();
      expect(responseData.url).toBeDefined();

      // Clean up the added document
      if (responseData.id) {
        await admin.firestore().collection(testCollection).doc(responseData.id).delete();
      }
    });
  });

  describe('updateDocument', () => {
    // Test updating an existing document
    it('should update document data when valid ID and data are provided', async () => {
      const updateData = {
        name: 'Updated Document',
        updated: true
      };

      const result = await updateDocument(testCollection, testDocId, updateData);
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      
      // Parse the response
      const responseData = JSON.parse(result.content[0].text);
      
      // Verify update response
      expect(responseData.success).toBe(true);
      expect(responseData.url).toBeDefined();

      // Verify the document was actually updated
      const updatedDoc = await getDocument(testCollection, testDocId);
      const updatedData = JSON.parse(updatedDoc.content[0].text).data;
      expect(updatedData.name).toBe(updateData.name);
      expect(updatedData.updated).toBe(true);
    });

    // Test error handling for non-existent document
    it('should handle updating non-existent document gracefully', async () => {
      const result = await updateDocument(testCollection, 'non-existent-doc', { test: true });
      
      // Verify error response
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/NOT_FOUND/);
    });
    
    // Test error handling when service account path is not set
    it('should handle Firestore errors when service account path is not set', async () => {
      // Save the original service account path
      const originalPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
      
      try {
        // Clear the service account path
        delete process.env.SERVICE_ACCOUNT_KEY_PATH;
        
        // Create a temporary document that we know exists
        const tempDocRef = admin.firestore().collection(testCollection).doc(testDocId);
        await tempDocRef.set({ temp: true });
        
        // Call the function
        const result = await updateDocument(testCollection, testDocId, { test: true });
        
        // The update succeeds but then fails when trying to get the project ID for the console URL
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Service account path not set');
      } finally {
        // Restore the original service account path
        process.env.SERVICE_ACCOUNT_KEY_PATH = originalPath;
      }
    });
  });

  describe('deleteDocument', () => {
    it('should delete a document in a collection', async () => {
      // First create a document to delete
      const tempDocId = 'temp-doc-to-delete';
      await admin.firestore().collection(testCollection).doc(tempDocId).set(testData);

      const result = await deleteDocument(testCollection, tempDocId);
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      
      // Parse the response
      const responseData = JSON.parse(result.content[0].text);
      
      // Verify delete response
      expect(responseData.success).toBe(true);

      // Verify the document was actually deleted
      const deletedDoc = await getDocument(testCollection, tempDocId);
      expect(deletedDoc.isError).toBe(true);
      expect(deletedDoc.content[0].text).toBe('Document not found: ' + tempDocId);
    });

    it('should report firestore errors when service account path is not set', async () => {
      // Create proper mocks for Firestore methods
      const mockDocData = { exists: false };
      
      // Create mock document reference with both get and delete methods
      const mockDoc = {
        get: vi.fn().mockResolvedValue(mockDocData),
        delete: vi.fn()
      };
      
      const mockCollection = {
        doc: vi.fn().mockReturnValue(mockDoc)
      };
      
      // Mock the collection method
      vi.spyOn(admin.firestore(), 'collection').mockReturnValue(mockCollection as any);
      
      const result = await deleteDocument('tests', 'non-existent-doc');
      
      // For non-existent documents, expect the "no entity to delete" message
      expect(result).toHaveProperty('content');
      expect(result.content[0].text).toBe('no entity to delete');
      expect(result.isError).toBe(true);
    });
  });

  describe('listDocuments', () => {
    it('should list documents with filters', async () => {
      const dateFilter = {
        field: 'timestamp',
        operator: '==' as const,
        value: testData.timestamp
      };

      const result = await listDocuments(testCollection, [dateFilter]);
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      
      // Parse the response
      const responseData = JSON.parse(result.content[0].text);
      
      // Verify documents array exists
      expect(Array.isArray(responseData.documents)).toBe(true);
      expect(responseData.documents.length).toBeGreaterThan(0);
      
      // Verify document structure
      const document = responseData.documents[0];
      expect(document.id).toBeDefined();
      expect(document.data).toBeDefined();
      expect(document.url).toBeDefined();
      expect(document.data.timestamp).toBe(testData.timestamp);
    });

    // Test error handling for Firebase initialization issues
    it('should handle Firebase initialization issues', async () => {
      // Use vi.spyOn to mock the admin.firestore method
      const firestoreSpy = vi.spyOn(admin, 'firestore').mockImplementation(() => {
        throw new Error('Firebase not initialized');
      });

      try {
        const result = await listDocuments(testCollection, []);
        
        // Verify error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Firebase not initialized');
      } finally {
        // Restore the original implementation
        firestoreSpy.mockRestore();
      }
    });
  });

  describe('listCollections', () => {
    it('should list available collections', async () => {
      const result = await list_collections();
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      
      // Parse the response
      const responseData = JSON.parse(result.content[0].text);
      
      // Verify collections array exists
      expect(Array.isArray(responseData.collections)).toBe(true);
      
      // Verify collection structure
      const collection = responseData.collections[0];
      expect(collection.id).toBeDefined();
      expect(collection.path).toBeDefined();
      expect(collection.url).toBeDefined();
    });
  });
});
