// node --test scripts/release-notes.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSection, releaseNotes } from "./release-notes.mjs";

const FEATURE = `## 0.5.0

### Minor Changes

- 2520d0f: New package for React Native: AsyncStorage
  session persistence.
- 3e51807: Add \`useSolanaSessionKey\`.

### Patch Changes

- Updated dependencies [2520d0f]
  - @naculus/connect-appkit-core@0.5.0

## 0.4.0

- 4f99028: Older change.
`;

const packages = [
  { name: "@naculus/connect-appkit-core", changelog: FEATURE },
  { name: "@naculus/connect-appkit-react", changelog: FEATURE },
  {
    name: "@naculus/connect-appkit-ui",
    changelog:
      "## 0.5.0\n\n### Patch Changes\n\n- Updated dependencies [2520d0f]\n  - @naculus/connect-appkit-react@0.5.0\n",
  },
  {
    name: "@naculus/connect-appkit-wc",
    changelog: "## 0.5.0\n\nNo changes in this release.\n",
  },
];

test("lists each change once, with the packages it touched", () => {
  const notes = releaseNotes(packages, "0.5.0");
  assert.equal(notes.match(/New package for React Native/g).length, 1);
  assert.match(
    notes,
    /- New package for React Native: AsyncStorage session persistence\. \(2520d0f\)\n {2}— `@naculus\/connect-appkit-core`, `@naculus\/connect-appkit-react`/,
  );
  assert.doesNotMatch(notes, /Older change|Updated dependencies/);
});

test("lists dependency-only and empty sections as version bump only", () => {
  assert.match(
    releaseNotes(packages, "0.5.0"),
    /### Version bump only\n\n- `@naculus\/connect-appkit-ui`\n- `@naculus\/connect-appkit-wc`\n$/,
  );
});

test("refuses a package whose CHANGELOG has no section for the version", () => {
  assert.throws(
    () =>
      releaseNotes(
        [...packages, { name: "@naculus/connect-native", changelog: "" }],
        "0.5.0",
      ),
    /@naculus\/connect-native; run `pnpm changeset version`/,
  );
});

test("refuses a release in which no package changed", () => {
  assert.throws(
    () => releaseNotes(packages.slice(2), "0.5.0"),
    /add a changeset/,
  );
});

test("treats every metacharacter in a version literally", () => {
  const changelog = `## 1.0.0+build(1)\n\n- Exact\n\n## 1x0x0build1\n\n- Different\n`;
  assert.equal(extractSection(changelog, "1.0.0+build(1)"), "- Exact");
  assert.equal(
    extractSection("## 1x0x0build1\n\n- Different\n", "1.0.0+build(1)"),
    null,
  );
});
