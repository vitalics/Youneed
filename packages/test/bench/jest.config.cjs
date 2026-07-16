// Minimal jest config: only our CJS workload, no coverage, no transform (the
// files are plain CJS), so we measure jest's runner overhead, not babel/ts.
module.exports = {
  rootDir: __dirname,
  testMatch: ["<rootDir>/workloads/jest/**/*.test.js"],
  collectCoverage: false,
  transform: {},
  // silence per-file noise; the wall-clock is what hyperfine reads
  reporters: [["default", { summaryThreshold: 0 }]],
};
