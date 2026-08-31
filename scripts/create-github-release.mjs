import { readFile, writeFile } from "node:fs/promises";

const packages = [
  ["@texaryn/core", "packages/core"],
  ["@texaryn/schema-json", "packages/schema-json"],
  ["@texaryn/react", "packages/react"],
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function extractVersionSection(changelog, version) {
  const marker = `## ${version}`;
  const start = changelog.indexOf(marker);

  if (start === -1) {
    return "No user-facing changes.";
  }

  const contentStart = start + marker.length;
  const nextVersion = changelog.indexOf("\n## ", contentStart);

  return changelog
    .slice(contentStart, nextVersion === -1 ? undefined : nextVersion)
    .trim();
}

const packageData = await Promise.all(
  packages.map(async ([name, directory]) => {
    const manifest = await readJson(`${directory}/package.json`);
    const changelog = await readFile(`${directory}/CHANGELOG.md`, "utf8");

    return {
      name,
      directory,
      version: manifest.version,
      changes: extractVersionSection(changelog, manifest.version),
    };
  }),
);

const versions = new Set(packageData.map(({ version }) => version));

if (versions.size !== 1) {
  throw new Error(
    `Expected fixed package versions, found: ${[...versions].join(", ")}`,
  );
}

const [version] = versions;

const notes = [
  `All Texaryn packages have been released as \`${version}\`.`,
  "",
  ...packageData.flatMap(({ name, version: packageVersion, changes }) => [
    `## ${name}`,
    "",
    `Version: \`${packageVersion}\``,
    "",
    changes,
    "",
  ]),
].join("\n");

await writeFile(".github-release-notes.md", notes);

console.log(version);
