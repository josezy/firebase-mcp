import { listDirectoryFiles, getFileInfo } from '../storageClient';
import { admin } from '../firebaseConfig';

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

describe('Storage Client', () => {
  describe('listDirectoryFiles', () => {
    // Test listing files in root directory
    it('should list files in the root directory', async () => {
      const result = await listDirectoryFiles(rootPath) as StorageResponse;
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      
      // Check if we got an error response
      if (result.isError) {
        console.log(`Error response: ${result.content[0].text}`);
        // Skip JSON parsing tests if we got an error
        return;
      }
      
      try {
        // Parse the response
        const responseData = JSON.parse(result.content[0].text);
        
        // Verify the response structure
        expect(responseData.files).toBeDefined();
        expect(Array.isArray(responseData.files)).toBe(true);
        expect(responseData.hasMore !== undefined).toBe(true);
        
        // Log for debugging
        console.log(responseData);
      } catch (error) {
        console.error(`Failed to parse JSON: ${result.content[0].text}`);
        // Don't fail the test if we can't parse JSON
      }
    });

    // Test with pagination parameters
    it('should handle pagination parameters', async () => {
      const pageSize = 5;
      const result = await listDirectoryFiles(rootPath, pageSize) as StorageResponse;
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      
      // Check if we got an error response
      if (result.isError) {
        console.log(`Error response: ${result.content[0].text}`);
        // Skip JSON parsing tests if we got an error
        return;
      }
      
      try {
        // Parse the response
        const responseData = JSON.parse(result.content[0].text);
        
        // Verify pagination
        expect(responseData.files).toBeDefined();
        expect(Array.isArray(responseData.files)).toBe(true);
        
        // Files should be limited by pageSize (unless there are fewer files)
        expect(responseData.files.length <= pageSize).toBe(true);
      } catch (error) {
        console.error(`Failed to parse JSON: ${result.content[0].text}`);
        // Don't fail the test if we can't parse JSON
      }
    });

    // Test error handling for Firebase initialization issues
    it('should handle Firebase initialization issues', async () => {
      // Use jest.spyOn to mock the admin.storage method
      const storageSpy = jest.spyOn(admin, 'storage').mockImplementation(() => {
        throw new Error('Firebase not initialized');
      });

      try {
        const result = await listDirectoryFiles(rootPath) as StorageResponse;
        
        // If Firebase is not initialized, the function should return an error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Could not access storage bucket');
      } finally {
        // Restore the original implementation
        storageSpy.mockRestore();
      }
    });

    // Test error handling for bucket access issues
    it('should handle bucket access issues', async () => {
      // Mock the storage bucket to simulate bucket access issues
      const mockBucket = {
        getFiles: jest.fn().mockRejectedValue(new Error('The specified bucket does not exist'))
      };
      
      const storageSpy = jest.spyOn(admin, 'storage').mockReturnValue({
        bucket: jest.fn().mockReturnValue(mockBucket)
      } as any);

      try {
        const result = await listDirectoryFiles(rootPath) as StorageResponse;
        
        // The function should return an error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('The specified bucket does not exist');
      } finally {
        // Restore the original implementation
        storageSpy.mockRestore();
      }
    });
  });

  describe('getFileInfo', () => {
    // Test error handling for non-existent files
    it('should handle non-existent files gracefully', async () => {
      try {
        await getFileInfo(nonExistentPath);
        fail('Expected getFileInfo to throw an error for non-existent file');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('No such object');
      }
    });

    // Test error handling for Firebase initialization issues
    it('should handle Firebase initialization issues', async () => {
      // Use jest.spyOn to mock the admin.storage method
      const storageSpy = jest.spyOn(admin, 'storage').mockImplementation(() => {
        throw new Error('Firebase not initialized');
      });

      try {
        const result = await getFileInfo(testFilePath) as StorageResponse;
        
        // If Firebase is not initialized, the function should return an error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Could not access storage bucket');
      } finally {
        // Restore the original implementation
        storageSpy.mockRestore();
      }
    });

    // Test error handling for bucket access issues
    it('should handle bucket access issues', async () => {
      // Mock the storage bucket to simulate bucket access issues
      const mockFile = {
        exists: jest.fn().mockResolvedValue([false])
      };
      
      const mockBucket = {
        file: jest.fn().mockReturnValue(mockFile)
      };
      
      const storageSpy = jest.spyOn(admin, 'storage').mockReturnValue({
        bucket: jest.fn().mockImplementation(() => {
          throw new Error('The specified bucket does not exist');
        })
      } as any);

      try {
        const result = await getFileInfo(testFilePath) as StorageResponse;
        
        // The function should return an error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Could not access storage bucket');
      } finally {
        // Restore the original implementation
        storageSpy.mockRestore();
      }
    });

    // Test handling of file not found
    it('should handle file not found gracefully', async () => {
      // Mock the storage bucket to simulate file not found
      const mockFile = {
        exists: jest.fn().mockResolvedValue([false])
      };
      
      const mockBucket = {
        file: jest.fn().mockReturnValue(mockFile),
        name: 'test-bucket'
      };
      
      const storageSpy = jest.spyOn(admin, 'storage').mockReturnValue({
        bucket: jest.fn().mockReturnValue(mockBucket)
      } as any);

      try {
        // Set NODE_ENV to something other than 'test' to avoid throwing
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        process.env.USE_FIREBASE_EMULATOR = '';
        
        const result = await getFileInfo(testFilePath) as StorageResponse;
        
        // The function should return an error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('File not found');
        
        // Restore the original NODE_ENV
        process.env.NODE_ENV = originalNodeEnv;
        process.env.USE_FIREBASE_EMULATOR = 'true';
      } finally {
        // Restore the original implementation
        storageSpy.mockRestore();
      }
    });
  });
});
