/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  // The package's own name must resolve to its entry point. boundary.test.ts
  // imports by package name on purpose — that is the whole point of the file:
  // a test that reaches in by relative path never opens the door the
  // architecture depends on, so `main` can rot to a file that does not exist
  // and every suite still passes. Mapping it here keeps that check honest
  // without needing the package installed into its own node_modules.
  moduleNameMapper: {
    '^@buddynext/mobile-core$': '<rootDir>/index.ts',
  },
};
