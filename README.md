# Firebase MCP Server

![Project Logo](./assets/logo.png)

<a href="https://glama.ai/mcp/servers/x4i8z2xmrq">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/x4i8z2xmrq/badge" alt="Firebase MCP server" />
</a>

[![Firebase Tests CI](https://github.com/gannonh/firebase-mcp/actions/workflows/firebase-tests.yml/badge.svg)](https://github.com/gannonh/firebase-mcp/actions/workflows/firebase-tests.yml)

## Overview

The [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) is an open protocol that enables LLM client applications to use tools and access external data sources. This MCP server allows any LLM client that supports the MCP protocol to interact with Firebase services including:

- **Authentication**: User management and verification
- **Firestore**: Document database operations
- **Storage**: File storage and retrieval

The server exposes Firebase services through MCP tools, making them accessible to LLM clients including [Claude Desktop](https://claude.ai/download), [Augment](https://docs.augmentcode.com/setup-augment/mcp#about-model-context-protocol-servers), [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers), [Cursor](https://www.cursor.com/), and others, while handling authentication and connection management.

## 🔥 New in v1.3.3: Storage Upload Features

Firebase MCP now supports direct file uploads to Firebase Storage! Version 1.3.3 introduces two new tools:

- **`storage_upload`**: Upload files directly from text or base64 content with automatic content type detection
- **`storage_upload_from_url`**: Import files from external URLs with a single command

Both tools provide **permanent public URLs** that don't expire, making it easier to share and access your uploaded files. They also include user-friendly response formatting to display file information and download links in a clean, readable format.

#### File Upload Options for MCP Clients

MCP clients can upload files to Firebase Storage in three ways:

1. **Direct Local File Path** (RECOMMENDED for binary files)
   ```ts
   {
     `filePath`: `my-image.png`,
     `content`: `/path/to/local/image.png`
   }
   ```
   The server will read the file, detect its content type, and upload it to Firebase Storage.

   > ‼️ **Note for MCP Clients**: This method is strongly recommended for all file types, especially binary files like PDFs and images. Path-based uploads are faster and more reliable than base64 encoding, which often fails with large files. MCP clients are made aware of this recommendation via the tool description. ‼️

2. **Base64 Data URL** (For binary data)
   ```ts
   {
     `filePath`: `my-image.png`,
     `content`: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...`
   }
   ```
   The server will automatically detect the content type from the data URL prefix. This method works (most of the time) for small files but **clients may struggle with larger files due to the base64 encoding string length**.

3. **Plain Text** (For text files)
   ```ts
   {
     `filePath`: `readme.md`,
     `content`: `# My README\n\nThis is a markdown file.`
   }
   ```

The server handles all the necessary conversion and content type detection, making it easy for MCP clients to upload files without complex preprocessing.

#### Best Practices for File Uploads

When using this server with any MCP client, follow these best practices for file uploads:

1. **Use Direct File Paths**: Always use the full path to files on your system
   ```ts
   {
     `filePath`: `financial_report.pdf`,
     `content`: `/Users/username/Downloads/report.pdf`
   }
   ```

2. **URL-Based Uploads**: For files available online, use the `storage_upload_from_url` tool
   ```ts
   {
     `filePath`: `financial_report.pdf`,
     `url`: `https://example.com/report.pdf`
   }
   ```

3. **Text Extraction**: For text-based files, Claude can extract and upload the content directly
   ```ts
   {
     `filePath`: `report_summary.txt`,
     `content`: `This quarterly report shows a 15% increase in revenue...`
   }
   ```

> ‼️ **Important**: Document references (like `/document/123` or internal references) are not directly accessible by external tools. Always use the actual file path or URL for reliable uploads. ‼️

## Setup

### 1. Firebase Configuration

- Go to [Firebase Console](https://console.firebase.google.com)
- Navigate to Project Settings > Service Accounts
- Click "Generate new private key"
- Save the JSON file securely

### 2. Environment Variables

The server requires the following environment variables:

- `SERVICE_ACCOUNT_KEY_PATH`: Path to your Firebase service account key JSON file (required)
- `FIREBASE_STORAGE_BUCKET`: Bucket name for Firebase Storage (optional)
  - If not provided, defaults to `[projectId].appspot.com`

### 3. Install MCP Server

Add the server configuration to your MCP settings file:

- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Augment: `~/Library/Application Support/Code/User/settings.json`
- Cursor: `[project root]/.cursor/mcp.json`

MCP Servers can be installed manually or at runtime via npx (recommended). How you install determines your configuration:

#### Configure for npx

   ```json
   {
     "firebase-mcp": {
       "command": "npx",
       "args": [
         "-y",
         "@gannonh/firebase-mcp"
       ],
       "env": {
         "SERVICE_ACCOUNT_KEY_PATH": "/absolute/path/to/serviceAccountKey.json",
         "FIREBASE_STORAGE_BUCKET": "your-project-id.firebasestorage.app"
       }
     }
   }
   ```

#### Configure for local installation

   ```json
   {
     "firebase-mcp": {
       "command": "node",
       "args": [
         "/absolute/path/to/firebase-mcp/dist/index.js"
       ],
       "env": {
         "SERVICE_ACCOUNT_KEY_PATH": "/absolute/path/to/serviceAccountKey.json",
         "FIREBASE_STORAGE_BUCKET": "your-project-id.firebasestorage.app"
       }
     }
   }
   ```

#### Manual Installation

##### Install Dependencies

   ```bash
   git clone https://github.com/gannonh/firebase-mcp
   cd firebase-mcp
   npm install
   ```

##### Build the Project

   ```bash
   npm run build
   ```

### Test your Installation

To make sure everything is working, simply prompt your client: `Please run through and test all of your Firebase MCP tools.`

## Features

### Authentication Tools

- `auth_get_user`: Get user details by ID or email

  ```ts
  {
    identifier: string // User ID or email address
  }
  ```

### Firestore Tools

- `firestore_add_document`: Add a document to a collection

  ```ts
  {
    collection: string,
    data: object
  }
  ```

- `firestore_list_collections`: List available collections

  ```ts
  {
    documentPath?: string, // Optional parent document path
    limit?: number,        // Default: 20
    pageToken?: string     // For pagination
  }
  ```

- `firestore_list_documents`: List documents with optional filtering

  ```ts
  {
    collection: string,
    filters?: Array<{
      field: string,
      operator: string,
      value: any
    }>,
    limit?: number,
    pageToken?: string
  }
  ```

- `firestore_get_document`: Get a specific document

  ```ts
  {
    collection: string,
    id: string
  }
  ```

- `firestore_update_document`: Update an existing document

  ```ts
  {
    collection: string,
    id: string,
    data: object
  }
  ```

- `firestore_delete_document`: Delete a document

  ```ts
  {
    collection: string,
    id: string
  }
  ```

- `firestore_query_collection_group`: Query documents across all sub-collections 🆕

  ```ts
  {
    collectionId: string,       // The collection ID to query across all documents
    filters?: Array<{           // Optional filters
      field: string,
      operator: string,         // ==, !=, <, <=, >, >=, array-contains, array-contains-any, in, not-in
      value: any
    }>,
    orderBy?: Array<{           // Optional fields to order by
      field: string,
      direction?: 'asc' | 'desc' // Default: 'asc'
    }>,
    limit?: number,             // Maximum documents to return (default: 20, max: 100)
    pageToken?: string          // Token for pagination
  }
  ```

### Storage Tools

- `storage_list_files`: List files in a directory

  ```ts
  {
    directoryPath?: string, // Optional path, defaults to root
    pageSize?: number,      // Number of items per page, defaults to 10
    pageToken?: string      // Token for pagination
  }
  ```

- `storage_get_file_info`: Get file metadata and download URL

  ```ts
  {
    filePath: string // Path to the file in storage
  }
  ```

- `storage_upload`: Upload a file to Firebase Storage from content (text, base64, etc.)

  ```ts
  {
    filePath: string,                  // The destination path in Firebase Storage
    content: string,                   // The file content (text or base64 encoded data)
    contentType?: string,              // Optional MIME type. If not provided, it will be inferred
    metadata?: Record<string, any>     // Optional additional metadata
  }
  ```

- `storage_upload_from_url`: Upload a file to Firebase Storage from an external URL

  ```ts
  {
    filePath: string,                  // The destination path in Firebase Storage
    url: string,                       // The source URL to download from
    contentType?: string,              // Optional MIME type. If not provided, it will be inferred from response headers
    metadata?: Record<string, any>     // Optional additional metadata
  }
  ```

### Response Formatting for MCP Clients

When displaying responses from the Firebase MCP server, clients should format the responses in a user-friendly way. This is especially important for storage operations where users benefit from seeing file information in a structured format with clickable links.

#### Example: Formatting Storage Upload Responses

Raw response from `storage_upload` or `storage_upload_from_url`:
```json
{
  "name": "example.txt",
  "size": "1024",
  "contentType": "text/plain",
  "updated": "2025-04-10T22:37:10.290Z",
  "downloadUrl": "https://storage.googleapis.com/bucket/example.txt?token..."
}
```

Recommended client formatting:
```markdown
## File Successfully Uploaded! 📁

Your file has been uploaded to Firebase Storage:

**File Details:**
- **Name:** example.txt
- **Size:** 1024 bytes
- **Type:** text/plain
- **Last Updated:** April 10, 2025 at 22:37:10 UTC

**[Click here to download your file](https://storage.googleapis.com/bucket/example.txt?token...)**
```

This formatting provides a better user experience by:
1. Clearly indicating success with a descriptive heading
2. Organizing file details in an easy-to-read format
3. Providing a clickable download link
4. Using appropriate formatting and emoji for visual appeal

## Development

### Building

```bash
npm run build
```

### Testing

The project uses Vitest for testing. Tests can be run against Firebase emulators to avoid affecting production data.

1. **Install Firebase Emulators**

   ```bash
   npm install -g firebase-tools
   firebase init emulators
   ```

2. **Start Emulators**

   ```bash
   firebase emulators:start
   ```

3. **Run Tests**

   ```bash
   # Run tests with emulator
   npm run test:emulator

   # Run tests with coverage report
   npm run test:coverage

   # Run tests with coverage report in emulator mode
   npm run test:coverage:emulator
   ```

   The coverage reports will be generated in the `coverage` directory. The project aims to maintain at least 90% code coverage across all metrics (lines, statements, functions, and branches).

### Architecture

The server is structured into three main components:

```
src/
├── index.ts              # Server entry point
└── lib/
    └── firebase/
        ├── authClient.ts       # Authentication operations
        ├── firebaseConfig.ts   # Firebase configuration
        ├── firestoreClient.ts  # Firestore operations
        └── storageClient.ts    # Storage operations
```

Each client module implements specific Firebase service operations and exposes them as MCP tools.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests (80%+ coverage required to pass CI workflow)
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Related Resources

- [Model Context Protocol](https://github.com/modelcontextprotocol)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)

## Troubleshooting

### Common Issues

#### "The specified bucket does not exist" Error

If you encounter this error when trying to access Firebase Storage:

1. Check that your Firebase project has Storage enabled
   - Go to the Firebase Console
   - Navigate to Storage
   - Complete the initial setup if you haven't already

2. Verify the correct bucket name
   - The default bucket name is usually `[projectId].appspot.com`
   - Some projects use `[projectId].firebasestorage.app` instead
   - You can find your bucket name in the Firebase Console under Storage

3. Set the `FIREBASE_STORAGE_BUCKET` environment variable
   - Add the correct bucket name to your MCP configuration
   - Example: `"FIREBASE_STORAGE_BUCKET": "your-project-id.firebasestorage.app"`

#### "Firebase is not initialized" Error

If you see this error:

1. Verify your service account key path
   - Make sure the path in `SERVICE_ACCOUNT_KEY_PATH` is correct and absolute
   - Check that the file exists and is readable

2. Check service account permissions
   - Ensure the service account has the necessary permissions for the Firebase services you're using
   - For Storage, the service account needs the Storage Admin role

#### "This query requires a composite index" Error

If you see this error when using `firestore_query_collection_group` with filters or ordering:

1. Follow the provided URL in the error message to create the required index
2. Once the index is created (which may take a few minutes), retry your query
3. For complex queries with multiple fields, you might need to create multiple indexes

#### JSON Parsing Errors

If you see errors about invalid JSON:

1. Make sure there are no `console.log` statements in the code
   - All logging should use `console.error` to avoid interfering with the JSON communication
   - The MCP protocol uses stdout for JSON communication

2. Check for syntax errors in your requests
   - Verify that all parameters are correctly formatted
   - Check for typos in field names
