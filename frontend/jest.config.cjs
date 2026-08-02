/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
    '\\.(png|svg|jpg|jpeg|gif)$': '<rootDir>/src/__mocks__/fileMock.js',
    '^../services/api$': '<rootDir>/src/__mocks__/services/api.ts',
    '^../../services/api$': '<rootDir>/src/__mocks__/services/api.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@reduxjs/toolkit|react-redux)/)',
  ],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
};
