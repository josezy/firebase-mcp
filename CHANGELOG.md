# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.3] - 2025-04-10

### Added

- New storage upload capabilities:
  - `storage_upload`: Upload files directly to Firebase Storage from text or base64 content
  - `storage_upload_from_url`: Upload files to Firebase Storage from external URLs
- **Permanent public URLs** for uploaded files that don't expire and work with public storage rules
- Support for direct local file path uploads - no need for Base64 conversion
- Improved guidance for all MCP clients on file upload best practices
- Automatic filename sanitization for better URL compatibility
- Response formatting metadata for MCP clients to display user-friendly file upload information
- Improved error handling for storage operations
- Automatic content type detection for uploaded files

### Fixed

- Fixed response format issues with storage tools to comply with MCP protocol standards
- Fixed image encoding issues to ensure uploaded images display correctly
- Improved error handling for invalid base64 data
- Enhanced MIME type detection for files uploaded from URLs

## [1.3.2] - 2024-04-10

### Added

- Added ESLint and Prettier for code quality and formatting
- Added lint and format scripts to package.json
- Added preflight script that runs formatting, linting, tests, and build in sequence
- Enhanced CI workflow to check code formatting and linting
- Added GitHub issues for new feature enhancements

### Fixed

- Fixed TypeScript errors in test files
- Fixed tests to work properly in emulator mode
- Excluded test files from production build
- Resolved lint warnings throughout the codebase

### Changed

- Updated CI workflow to use preflight script before publishing
- Modified test assertions to be more resilient in different environments
- Improved error handling in storage client tests

## [1.3.1] - 2024-04-08

### Fixed

- Fixed compatibility issues with Firebase Storage emulator
- Improved error handling in Firestore client

## [1.3.0] - 2024-04-05

### Added

- Added new `firestore_query_collection_group` tool to query documents across subcollections with the same name (commit [92b0548](https://github.com/gannonh/firebase-mcp/commit/92b0548))
- Implemented automatic extraction of Firebase console URLs for creating composite indexes when required (commit [cf9893b](https://github.com/gannonh/firebase-mcp/commit/cf9893b))

### Fixed

- Enhanced error handling for Firestore queries that require composite indexes (commit [cf9893b](https://github.com/gannonh/firebase-mcp/commit/cf9893b))
- Improved test validations to be more resilient to pre-existing test data (commit [cf9893b](https://github.com/gannonh/firebase-mcp/commit/cf9893b))

### Changed

- Updated README to specify 80%+ test coverage requirement for CI (commit [69a3e18](https://github.com/gannonh/firebase-mcp/commit/69a3e18))
- Updated `.gitignore` to exclude workspace configuration files (commit [ca42d0f](https://github.com/gannonh/firebase-mcp/commit/ca42d0f))

## [1.1.4] - 2024-04-01

### Changed

- Migrated test framework from Jest to Vitest
- Updated GitHub Actions CI workflow to use Vitest
- Enhanced test coverage, improving overall branch coverage from 77.84% to 85.05%
- Improved test stability in emulator mode, particularly for auth client tests

### Added

- Added tests for Firebase index error handling
- Added tests for data sanitization edge cases
- Added tests for pagination and document path support in Firestore
- Added additional error handling tests for Authentication client

### Fixed

- Fixed intermittent authentication test failures in emulator mode
- Fixed invalid pageToken test to properly handle error responses
- Resolved edge cases with unusual or missing metadata in storage tests

## [1.1.3] - 2024-04-01

### Fixed

- Support for Cursor
- Fixed Firestore `deleteDocument` function to properly handle non-existent documents
- Updated Auth client tests to handle dynamic UIDs from Firebase emulator
- Corrected logger import paths in test files
- Improved error handling in Firestore client tests
- Fixed Storage client tests to match current implementation

### Added

- Added proper error messages for non-existent documents in Firestore operations
- Enhanced test coverage for error scenarios in all Firebase services

### Changed

- Updated test suite to use Firebase emulator for consistent testing
- Improved logging in test files for better debugging
- Refactored test helper functions for better maintainability

## [1.1.2] - Previous version

- Initial release
