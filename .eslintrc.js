module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: ["eslint:recommended", "xo", "plugin:prettier/recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "import"],
  rules: {
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { destructuredArrayIgnorePattern: "^_" },
    ],
    "arrow-body-style": [
      "error",
      "as-needed",
      { requireReturnForObjectLiteral: false },
    ],
    "import/order": [
      "error",
      { alphabetize: { order: "asc" }, "newlines-between": "always" },
    ],
    "import/no-cycle": "error",
    "no-unused-vars": "off",
  },
};
