/* eslint-disable no-console */
const { spawnSync } = require("child_process");

function runStep(title, args) {
  console.log(`\n=== ${title} ===`);
  console.log(`> npx ${args.join(" ")}`);

  const result = spawnSync("npx", args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`\n[FAIL] ${title} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }

  console.log(`[OK] ${title}`);
}

function main() {
  runStep("Unit tests", [
    "jest",
    "tests/validation.test.js",
    "tests/security.test.js",
    "--runInBand",
    "--passWithNoTests",
  ]);

  runStep("Integration tests", [
    "jest",
    "tests/integration.test.js",
    "tests/api.functional.test.js",
    "--runInBand",
    "--passWithNoTests",
  ]);

  console.log("\nAll unit and integration tests passed.");
}

main();
