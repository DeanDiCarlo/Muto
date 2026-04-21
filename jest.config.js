/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^next/server$': '<rootDir>/src/__mocks__/next-server.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: true } }],
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
}

module.exports = config
