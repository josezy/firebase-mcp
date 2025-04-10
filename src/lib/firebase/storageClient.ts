/**
 * Firebase Storage Client
 *
 * This module provides functions for interacting with Firebase Storage.
 * It includes operations for listing files in directories and retrieving file metadata.
 * All functions handle bucket name resolution and return data in a format compatible
 * with the MCP protocol response structure.
 *
 * @module firebase-mcp/storage
 */

import * as admin from 'firebase-admin';
import axios from 'axios';
import { getProjectId } from './firebaseConfig';

//const storage = admin.storage().bucket();

/**
 * Standard response type for all Storage operations.
 * This interface defines the structure of responses returned by storage functions,
 * conforming to the MCP protocol requirements.
 *
 * @interface StorageResponse
 * @property {Array<{type: string, text: string}>} content - Array of content items to return to the client
 * @property {boolean} [isError] - Optional flag indicating if the response represents an error
 */
interface StorageResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Gets the correct bucket name for Firebase Storage operations.
 * This function tries multiple approaches to determine the bucket name:
 * 1. Uses the FIREBASE_STORAGE_BUCKET environment variable if available
 * 2. Falls back to standard bucket name formats based on the project ID
 *
 * @param {string} projectId - The Firebase project ID
 * @returns {string} The resolved bucket name to use for storage operations
 *
 * @example
 * // Get bucket name for a project
 * const bucketName = getBucketName('my-firebase-project');
 */
export function getBucketName(projectId: string): string {
  // Get bucket name from environment variable or use default format
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (storageBucket) {
    console.error(`Using bucket name from environment: ${storageBucket}`);
    return storageBucket;
  }

  // Special handling for emulator environment
  const isEmulator =
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
    process.env.USE_FIREBASE_EMULATOR === 'true' ||
    process.env.NODE_ENV === 'test';

  if (isEmulator) {
    console.error(`Using emulator bucket format for project: ${projectId}`);
    return `${projectId}.firebasestorage.app`;
  }

  // Try different bucket name formats as fallbacks
  const possibleBucketNames = [
    `${projectId}.firebasestorage.app`,
    `${projectId}.appspot.com`,
    projectId,
  ];

  console.error(
    `No FIREBASE_STORAGE_BUCKET environment variable set. Trying default bucket names: ${possibleBucketNames.join(', ')}`
  );
  console.error(`DEBUG: Using first bucket name: ${possibleBucketNames[0]}`);
  return possibleBucketNames[0]; // Default to first format
}

export async function getBucket() {
  try {
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH;
    if (!serviceAccountPath) {
      return null;
    }

    const projectId = getProjectId(serviceAccountPath);
    if (!projectId) {
      return null;
    }

    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (storageBucket) {
      return admin.storage().bucket(storageBucket);
    }

    const possibleBucketNames = [`${projectId}.firebasestorage.app`, `${projectId}.appspot.com`];

    return admin.storage().bucket(possibleBucketNames[0]);
  } catch (_error) {
    return null;
  }
}

/**
 * Lists files and directories in a specified path in Firebase Storage.
 * Results are paginated and include download URLs for files and console URLs for directories.
 *
 * @param {string} [directoryPath] - The path to list files from (e.g., 'images/' or 'documents/2023/')
 *                          If not provided, lists files from the root directory
 * @param {number} [pageSize=10] - Number of items to return per page
 * @param {string} [pageToken] - Token for pagination to get the next page of results
 * @returns {Promise<StorageResponse>} MCP-formatted response with file and directory information
 * @throws {Error} If Firebase is not initialized or if there's a Storage error
 *
 * @example
 * // List files in the root directory
 * const rootFiles = await listDirectoryFiles();
 *
 * @example
 * // List files in a specific directory with pagination
 * const imageFiles = await listDirectoryFiles('images', 20);
 * // Get next page using the nextPageToken from the previous response
 * const nextPage = await listDirectoryFiles('images', 20, response.nextPageToken);
 */
export async function listDirectoryFiles(
  directoryPath: string = '',
  pageSize: number = 10,
  pageToken?: string
): Promise<StorageResponse> {
  try {
    const bucket = await getBucket();
    if (!bucket) {
      return {
        content: [{ type: 'error', text: 'Storage bucket not available' }],
        isError: true,
      };
    }

    const prefix = directoryPath ? `${directoryPath.replace(/\/*$/, '')}/` : '';
    const [files, nextPageToken] = await bucket.getFiles({
      prefix,
      maxResults: pageSize,
      pageToken,
    });

    const fileList = files.map(file => ({
      name: file.name,
      size: file.metadata.size,
      contentType: file.metadata.contentType,
      updated: file.metadata.updated,
      downloadUrl: file.metadata.mediaLink,
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify({ files: fileList, nextPageToken }) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: `Error listing files: ${errorMessage}` }],
      isError: true,
    };
  }
}

/**
 * Retrieves detailed information about a specific file in Firebase Storage.
 * Returns file metadata and a signed download URL with 1-hour expiration.
 *
 * @param {string} filePath - The complete path to the file in storage (e.g., 'images/logo.png')
 * @returns {Promise<StorageResponse>} MCP-formatted response with file metadata and download URL
 * @throws {Error} If Firebase is not initialized, if the file doesn't exist, or if there's a Storage error
 *
 * @example
 * // Get information about a specific file
 * const fileInfo = await getFileInfo('documents/report.pdf');
 */
export async function getFileInfo(filePath: string): Promise<StorageResponse> {
  try {
    const bucket = await getBucket();
    if (!bucket) {
      return {
        content: [{ type: 'error', text: 'Storage bucket not available' }],
        isError: true,
      };
    }

    const file = bucket.file(filePath);
    const [exists] = await file.exists();

    if (!exists) {
      return {
        content: [{ type: 'error', text: `File not found: ${filePath}` }],
        isError: true,
      };
    }

    const [metadata] = await file.getMetadata();
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // URL expires in 15 minutes
    });

    const fileInfo = {
      name: metadata.name,
      size: metadata.size,
      contentType: metadata.contentType,
      updated: metadata.updated,
      downloadUrl: url,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(fileInfo) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: `Error getting file info: ${errorMessage}` }],
      isError: true,
    };
  }
}

/**
 * Uploads a file to Firebase Storage from content (text, base64, etc.)
 *
 * @param {string} filePath - The destination path in Firebase Storage
 * @param {string} content - The file content (text or base64 encoded data)
 * @param {string} [contentType] - Optional MIME type. If not provided, it will be inferred
 * @param {object} [metadata] - Optional additional metadata
 * @returns {Promise<StorageResponse>} MCP-formatted response with file info
 * @throws {Error} If Firebase is not initialized or if there's a Storage error
 *
 * @example
 * // Upload a text file
 * const result = await uploadFile('logs/info.txt', 'Log content here', 'text/plain');
 *
 * @example
 * // Upload from base64
 * const result = await uploadFile('images/logo.png', 'data:image/png;base64,iVBORw0...');
 */
export async function uploadFile(
  filePath: string,
  content: string,
  contentType?: string,
  metadata?: Record<string, any>
): Promise<StorageResponse> {
  try {
    const bucket = await getBucket();
    if (!bucket) {
      return {
        content: [{ type: 'error', text: 'Storage bucket not available' }],
        isError: true,
      };
    }

    let buffer: Buffer;
    let detectedContentType = contentType;

    // Handle base64 data URLs
    if (content.startsWith('data:')) {
      const matches = content.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);

      if (matches && matches.length === 3) {
        // If content type not provided, use the one from data URL
        if (!detectedContentType) {
          detectedContentType = matches[1];
        }

        try {
          // Extract base64 data and convert to buffer
          buffer = Buffer.from(matches[2], 'base64');
        } catch (error) {
          return {
            content: [{ type: 'error', text: 'Invalid base64 data' }],
            isError: true,
          };
        }
      } else {
        return {
          content: [{ type: 'error', text: 'Invalid data URL format' }],
          isError: true,
        };
      }
    } else {
      // Treat as plain text if not a data URL
      buffer = Buffer.from(content);

      // Default to text/plain if content type not provided
      if (!detectedContentType) {
        detectedContentType = 'text/plain';
      }
    }

    // Create file reference
    const file = bucket.file(filePath);

    // Prepare upload options
    const options = {
      metadata: {
        contentType: detectedContentType,
        metadata: metadata || {},
      },
    };

    // Upload file
    await file.save(buffer, options);

    // Get file info including download URL
    const [fileMetadata] = await file.getMetadata();
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // URL expires in 15 minutes
    });

    const fileInfo = {
      name: fileMetadata.name,
      size: fileMetadata.size,
      contentType: fileMetadata.contentType,
      updated: fileMetadata.updated,
      downloadUrl: url,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(fileInfo) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: `Error uploading file: ${errorMessage}` }],
      isError: true,
    };
  }
}

/**
 * Uploads a file to Firebase Storage from an external URL
 *
 * @param {string} filePath - The destination path in Firebase Storage
 * @param {string} url - The source URL to download from
 * @param {string} [contentType] - Optional MIME type. If not provided, it will be inferred from response headers
 * @param {object} [metadata] - Optional additional metadata
 * @returns {Promise<StorageResponse>} MCP-formatted response with file info
 * @throws {Error} If Firebase is not initialized, if the URL is invalid, or if there's a Storage error
 *
 * @example
 * // Upload a file from URL
 * const result = await uploadFileFromUrl('documents/report.pdf', 'https://example.com/report.pdf');
 */
export async function uploadFileFromUrl(
  filePath: string,
  url: string,
  contentType?: string,
  metadata?: Record<string, any>
): Promise<StorageResponse> {
  try {
    const bucket = await getBucket();
    if (!bucket) {
      return {
        content: [{ type: 'error', text: 'Storage bucket not available' }],
        isError: true,
      };
    }

    // Fetch file from URL
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'Accept': 'application/octet-stream',
        },
      });

      // Use provided content type or get from response headers
      const detectedContentType = contentType || response.headers['content-type'] || 'application/octet-stream';

      // Create buffer from response data
      const buffer = Buffer.from(response.data);

      // Create file reference
      const file = bucket.file(filePath);

      // Prepare upload options
      const options = {
        metadata: {
          contentType: detectedContentType,
          metadata: {
            ...metadata,
            sourceUrl: url,
          },
        },
      };

      // Upload file
      await file.save(buffer, options);

      // Get file info including download URL
      const [fileMetadata] = await file.getMetadata();
      const [downloadUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // URL expires in 15 minutes
      });

      const fileInfo = {
        name: fileMetadata.name,
        size: fileMetadata.size,
        contentType: fileMetadata.contentType,
        updated: fileMetadata.updated,
        downloadUrl,
        sourceUrl: url,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(fileInfo) }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'error', text: `Error fetching or processing URL: ${errorMessage}` }],
        isError: true,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'error', text: `Error uploading file from URL: ${errorMessage}` }],
      isError: true,
    };
  }
}
