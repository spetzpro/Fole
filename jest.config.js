module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/app-repo/tests/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/app-repo/src/$1",
  },
};
