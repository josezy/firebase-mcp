import { listDirectoryFiles, getFileInfo, getBucketName, getBucket } from '../storageClient';
import { admin } from '../firebaseConfig';
import * as admin_module from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../../utils/logger';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Test imports for mocking
import * as firebaseConfig from '../firebaseConfig';

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
  // Add tests for getBucketName function
  describe('getBucketName', () => {
    // Save original environment variables to restore after tests
    const originalEnv = { ...process.env };
    
    // Reset environment variables after each test
    afterEach(() => {
      // Restore original environment variables
      process.env = { ...originalEnv };
    });
    
    it('should use FIREBASE_STORAGE_BUCKET when available', () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Set environment variable
      process.env.FIREBASE_STORAGE_BUCKET = 'test-bucket-from-env';
      
      // Call the function
      const result = getBucketName('test-project-id');
      
      // Verify result
      expect(result).toBe('test-bucket-from-env');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('test-bucket-from-env'));
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
    
    it('should use emulator format when in emulator environment', () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Clear storage bucket
      delete process.env.FIREBASE_STORAGE_BUCKET;
      
      // Set emulator environment
      process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
      
      // Call the function
      const result = getBucketName('emulator-project');
      
      // Verify result
      expect(result).toBe('emulator-project.firebasestorage.app');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Using emulator bucket format'));
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
    
    it('should use USE_FIREBASE_EMULATOR flag for emulator detection', () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Clear storage bucket and storage emulator host
      delete process.env.FIREBASE_STORAGE_BUCKET;
      delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
      
      // Set USE_FIREBASE_EMULATOR flag
      process.env.USE_FIREBASE_EMULATOR = 'true';
      
      // Call the function
      const result = getBucketName('flag-project');
      
      // Verify result
      expect(result).toBe('flag-project.firebasestorage.app');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Using emulator bucket format'));
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
    
    it('should use test environment for emulator detection', () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Clear all relevant environment variables
      delete process.env.FIREBASE_STORAGE_BUCKET;
      delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
      delete process.env.USE_FIREBASE_EMULATOR;
      
      // Set NODE_ENV to test
      process.env.NODE_ENV = 'test';
      
      // Call the function
      const result = getBucketName('test-env-project');
      
      // Verify result
      expect(result).toBe('test-env-project.firebasestorage.app');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Using emulator bucket format'));
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
    
    it('should fall back to default bucket name format', () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Clear all relevant environment variables
      delete process.env.FIREBASE_STORAGE_BUCKET;
      delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
      delete process.env.USE_FIREBASE_EMULATOR;
      process.env.NODE_ENV = 'production';
      
      // Call the function
      const result = getBucketName('fallback-project');
      
      // Verify result
      expect(result).toBe('fallback-project.firebasestorage.app');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No FIREBASE_STORAGE_BUCKET environment variable set'));
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  // Add tests for getBucket function
  describe('getBucket', () => {
    // Save original environment variables to restore after tests
    const originalEnv = { ...process.env };
    
    // Reset environment variables and mocks after each test
    afterEach(() => {
      // Restore original environment variables
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });
    
    it('should return null when SERVICE_ACCOUNT_KEY_PATH is not set', async () => {
      // Clear service account path
      delete process.env.SERVICE_ACCOUNT_KEY_PATH;
      
      // Call the function
      const result = await getBucket();
      
      // Verify result
      expect(result).toBeNull();
    });
    
    it('should return null when getProjectId returns null', async () => {
      // Set service account path
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/service-account.json';
      
      // Mock getProjectId to return null
      vi.spyOn(firebaseConfig, 'getProjectId').mockReturnValue(null);
      
      // Call the function
      const result = await getBucket();
      
      // Verify result
      expect(result).toBeNull();
    });
    
    it('should use FIREBASE_STORAGE_BUCKET when available', async () => {
      // Set service account path and project ID
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/service-account.json';
      process.env.FIREBASE_STORAGE_BUCKET = 'test-bucket-name';
      
      // Mock getProjectId to return a project ID
      vi.spyOn(firebaseConfig, 'getProjectId').mockReturnValue('test-project-id');
      
      // Mock bucket method
      const mockBucket = { name: 'test-bucket' };
      const mockStorage = {
        bucket: vi.fn().mockReturnValue(mockBucket)
      };
      vi.spyOn(admin, 'storage').mockReturnValue(mockStorage as any);
      
      // Call the function
      const result = await getBucket();
      
      // Verify result
      expect(result).toBe(mockBucket);
      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket-name');
    });
    
    it('should use default bucket name when FIREBASE_STORAGE_BUCKET is not set', async () => {
      // Set service account path and clear bucket name
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/service-account.json';
      delete process.env.FIREBASE_STORAGE_BUCKET;
      
      // Mock getProjectId to return a project ID
      vi.spyOn(firebaseConfig, 'getProjectId').mockReturnValue('default-project-id');
      
      // Mock bucket method
      const mockBucket = { name: 'default-bucket' };
      const mockStorage = {
        bucket: vi.fn().mockReturnValue(mockBucket)
      };
      vi.spyOn(admin, 'storage').mockReturnValue(mockStorage as any);
      
      // Call the function
      const result = await getBucket();
      
      // Verify result
      expect(result).toBe(mockBucket);
      expect(mockStorage.bucket).toHaveBeenCalledWith('default-project-id.firebasestorage.app');
    });
    
    it('should handle errors gracefully', async () => {
      // Set service account path
      process.env.SERVICE_ACCOUNT_KEY_PATH = '/path/to/service-account.json';
      
      // Mock getProjectId to return a project ID
      vi.spyOn(firebaseConfig, 'getProjectId').mockReturnValue('error-project-id');
      
      // Mock storage to throw an error
      vi.spyOn(admin, 'storage').mockImplementation(() => {
        throw new Error('Test storage error');
      });
      
      // Call the function
      const result = await getBucket();
      
      // Verify result
      expect(result).toBeNull();
    });
  });

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

    // Test error handling for metadata fetch errors
    it('should handle metadata fetch errors gracefully', async () => {
      // First ensure we have a valid bucket
      const bucket = await getBucket();
      expect(bucket).not.toBeNull();
      
      // Mock the file methods
      const mockFile = {
        exists: vi.fn().mockResolvedValue([true]),
        getMetadata: vi.fn().mockRejectedValue(new Error('Metadata fetch error')),
        getSignedUrl: vi.fn()
      };
      
      // Mock the bucket to return our mock file
      const bucketSpy = vi.spyOn(admin.storage(), 'bucket').mockReturnValue({
        file: vi.fn().mockReturnValue(mockFile)
      } as any);
      
      try {
        // Call the function
        const result = await getFileInfo('test-error-file.txt');
        
        // Verify error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Error getting file info');
        expect(result.content[0].text).toContain('Metadata fetch error');
      } finally {
        // Restore the original implementation
        bucketSpy.mockRestore();
      }
    });
    
    // Test error handling for signed URL fetch errors
    it('should handle signed URL fetch errors gracefully', async () => {
      // First ensure we have a valid bucket
      const bucket = await getBucket();
      expect(bucket).not.toBeNull();
      
      // Mock metadata result
      const mockMetadata = {
        name: 'url-error-file.txt',
        size: 1024,
        contentType: 'text/plain',
        updated: new Date().toISOString()
      };
      
      // Mock the file methods
      const mockFile = {
        exists: vi.fn().mockResolvedValue([true]),
        getMetadata: vi.fn().mockResolvedValue([mockMetadata]),
        getSignedUrl: vi.fn().mockRejectedValue(new Error('URL fetch error'))
      };
      
      // Mock the bucket to return our mock file
      const bucketSpy = vi.spyOn(admin.storage(), 'bucket').mockReturnValue({
        file: vi.fn().mockReturnValue(mockFile)
      } as any);
      
      try {
        // Call the function
        const result = await getFileInfo('url-error-file.txt');
        
        // Verify error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Error getting file info');
        expect(result.content[0].text).toContain('URL fetch error');
      } finally {
        // Restore the original implementation
        bucketSpy.mockRestore();
      }
    });
  });
});
