const { defaults } = require("jest-config");

const gomuPkg = require("./packages/sdk/package.json");

module.exports = {
  ...defaults,
  fakeTimers: {
    enableGlobally: true,
  },
  reporters: ["default"],
  collectCoverage: true,
  projects: [
    {
      displayName: gomuPkg.name,
      testMatch: ["<rootDir>/packages/sdk/src/**/*.test.ts"],
    },
  ],
};
