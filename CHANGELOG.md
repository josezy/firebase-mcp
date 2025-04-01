# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
