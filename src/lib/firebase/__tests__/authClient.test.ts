import { getUserByIdOrEmail } from '../authClient';
import { admin } from '../firebaseConfig';
import { logger } from '../../../utils/logger';

/**
 * Authentication Client Tests
 * 
 * These tests verify the functionality of the Firebase Authentication client operations.
 * Tests run against the Firebase emulator when available.
 */

// Test user data
const testEmail = 'test@example.com';
let testId: string;

// Helper function to ensure test user exists
async function ensureTestUser() {
  try {
    // Try to get user by email first
    try {
      const user = await admin.auth().getUserByEmail(testEmail);
      testId = user.uid;
      logger.debug('Test user already exists:', testEmail);
      return;
    } catch (error) {
      // User doesn't exist, create it
      const user = await admin.auth().createUser({
        email: testEmail,
        emailVerified: true
      });
      testId = user.uid;
      logger.debug('Test user created/verified:', testEmail);
    }
  } catch (error) {
    logger.error('Error ensuring test user exists:', error);
  }
}

// Helper function to delete test user
async function deleteTestUser() {
  try {
    if (testId) {
      await admin.auth().deleteUser(testId);
      logger.debug('Test user deleted:', testEmail);
    }
  } catch (error) {
    // Ignore errors if user doesn't exist
  }
}

// Set up test environment
beforeAll(async () => {
  // Ensure we're using the emulator in test mode
  if (process.env.USE_FIREBASE_EMULATOR === 'true') {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    logger.debug('Using Firebase Auth emulator');
  }
  
  await ensureTestUser();
});

// Clean up after tests
afterAll(async () => {
  await deleteTestUser();
});

describe('Authentication Client', () => {
  describe('getUserByIdOrEmail', () => {
    // Test getting user by UID
    it('should return user data when a valid UID is provided', async () => {
      const result = await getUserByIdOrEmail(testId);
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.isError).toBeUndefined();
      
      // Parse the response
      const responseData = JSON.parse(result.content[0].text);
      
      // Verify user data structure
      expect(responseData.uid).toBe(testId);
      expect(responseData.email).toBe(testEmail);
      expect(typeof responseData.emailVerified).toBe('boolean');
    });

    // Test getting user by email
    it('should return user data when a valid email is provided', async () => {
      const result = await getUserByIdOrEmail(testEmail);
      
      // Verify the response format
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.isError).toBeUndefined();
      
      // Parse the response
      const responseData = JSON.parse(result.content[0].text);
      
      // Verify user data structure
      expect(responseData.uid).toBe(testId);
      expect(responseData.email).toBe(testEmail);
      expect(typeof responseData.emailVerified).toBe('boolean');
    });

    // Test error handling for non-existent user ID
    it('should handle non-existent user ID gracefully', async () => {
      const result = await getUserByIdOrEmail('non-existent-id');
      
      // Verify error response
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('User not found: non-existent-id');
    });

    // Test error handling for non-existent email
    it('should handle non-existent email gracefully', async () => {
      const result = await getUserByIdOrEmail('nonexistent@example.com');
      
      // Verify error response
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('User not found: nonexistent@example.com');
    });

    // Test error handling for Firebase initialization issues
    it('should handle Firebase initialization issues', async () => {
      // Use jest.spyOn to mock the admin.auth method
      const authSpy = jest.spyOn(admin, 'auth').mockImplementation(() => {
        throw new Error('Firebase not initialized');
      });

      try {
        const result = await getUserByIdOrEmail(testId);
        
        // Verify error response
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('User not found: ' + testId);
      } finally {
        // Restore the original implementation
        authSpy.mockRestore();
      }
    });
  });
});
