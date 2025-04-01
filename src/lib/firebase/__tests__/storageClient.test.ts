import { listDirectoryFiles, getFileInfo } from '../storageClient';
import { admin } from '../firebaseConfig';
import * as admin_module from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../../utils/logger';
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

/**
 * Storage Client Tests
 * 
 * These tests verify the functionality of the Firebase Storage client operations.
 * Tests run against the Firebase emulator when available.
 */

// Define the response type to match what the functions return
interface StorageResponse {
  content: Array<{ type: string, text: string }>;
  isError?: boolean;
}

// Test paths and data
const rootPath = '';
const testDirectory = 'test-directory';
const testFilePath = 'test-file.txt';
const nonExistentPath = 'non-existent-path/file.txt';

// Create a test ID generator to track test runs
let testRunCounter = 0;
function getTestRunId() {
  return `Run-${++testRunCounter}`;
}

// Ensure Firebase connection is active for each test
beforeEach(async () => {
  const testRunId = getTestRunId();
  
  // If Firebase is not initialized, initialize it
  if (admin_module.apps.length === 0) {
    logger.debug('Firebase not initialized, initializing now...');
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH || 
      path.resolve(process.cwd(), 'firebaseServiceKey.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    admin_module.initializeApp({
      credential: admin_module.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`
    });
    
    // Set emulator environment variables
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
    logger.debug('Firebase reinitialized for storage tests');
  } else {
    logger.debug('Using existing Firebase initialization');
  }
  
  // Create a test file in the storage emulator to ensure the bucket is accessible
  try {
    logger.debug('Attempting to create test file in storage emulator');
    
    // Try to get a bucket reference
    const bucket = admin_module.storage().bucket();
    
    // Create a test file with some content
    const testFileContent = Buffer.from(`This is a test file for run ${testRunId}`);
    const tempFilePath = path.join(process.cwd(), `temp-test-file-${testRunId}.txt`);
    
    // Write the file to local filesystem first
    fs.writeFileSync(tempFilePath, testFileContent);
    
    // Upload to the bucket
    await bucket.upload(tempFilePath, {
      destination: `${testFilePath}-${testRunId}`,
      metadata: {
        contentType: 'text/plain',
      }
    });
    
    // Delete the temporary file
    fs.unlinkSync(tempFilePath);
    
    logger.debug(`Successfully created test file: ${testFilePath}-${testRunId}`);
  } catch (error) {
    logger.error(`Error creating test file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

describe('Storage Client', () => {
  describe('listDirectoryFiles', () => {
    // Test listing files in root directory
    it('should list files in the root directory', async () => {
      const result = await listDirectoryFiles(rootPath) as StorageResponse;
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.isError).toBeUndefined();
      
      // Parse the response
      const responseData = JSON.parse(result.content[0].text);
      
      // Verify the response structure
      expect(responseData.files).toBeDefined();
      expect(Array.isArray(responseData.files)).toBe(true);
      expect(responseData.files.length).toBeGreaterThan(0);
      
      // Verify file object structure
      const file = responseData.files[0];
      expect(file).toHaveProperty('name');
      expect(file).toHaveProperty('size');
      expect(file).toHaveProperty('contentType');
      expect(file).toHaveProperty('updated');
      // md5Hash is optional
    });

    // Test error handling for Firebase initialization issues
    it('should handle Firebase initialization issues', async () => {
      // Use vi.spyOn to mock the admin.storage method
      const storageSpy = vi.spyOn(admin, 'storage').mockImplementation(() => {
        throw new Error('Firebase not initialized');
      });

      try {
        const result = await listDirectoryFiles(rootPath) as StorageResponse;
        
        // Verify error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Storage bucket not available');
      } finally {
        // Restore the original implementation
        storageSpy.mockRestore();
      }
    });
  });

  describe('getFileInfo', () => {
    // Test getting file info for an existing file
    it('should get file info for an existing file', async () => {
      // First list files to get a valid file path
      const listResult = await listDirectoryFiles(rootPath) as StorageResponse;
      const files = JSON.parse(listResult.content[0].text).files;
      const testFile = files[0];
      
      // Get file info
      const result = await getFileInfo(testFile.name) as StorageResponse;
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.isError).toBeUndefined();
      
      // Parse the response
      const fileInfo = JSON.parse(result.content[0].text);
      
      // Verify file info structure
      expect(fileInfo).toHaveProperty('name');
      expect(fileInfo).toHaveProperty('size');
      expect(fileInfo).toHaveProperty('contentType');
      expect(fileInfo).toHaveProperty('updated');
      expect(fileInfo).toHaveProperty('downloadUrl');
      // md5Hash and bucket are optional
    });

    // Test error handling for non-existent files
    it('should handle non-existent files gracefully', async () => {
      const result = await getFileInfo(nonExistentPath) as StorageResponse;
      
      // Verify error response
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('File not found');
    });

    // Test error handling for Firebase initialization issues
    it('should handle Firebase initialization issues', async () => {
      // Use vi.spyOn to mock the admin.storage method
      const storageSpy = vi.spyOn(admin, 'storage').mockImplementation(() => {
        throw new Error('Firebase not initialized');
      });

      try {
        const result = await getFileInfo(testFilePath) as StorageResponse;
        
        // Verify error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Storage bucket not available');
      } finally {
        // Restore the original implementation
        storageSpy.mockRestore();
      }
    });
  });
});
