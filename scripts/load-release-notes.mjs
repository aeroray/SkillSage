// Loads the release notes for the tag being released and exposes them to the
// workflow as the `body` step output.
//
// The notes live in docs/releases/<tag>.md rather than inline in release.yml.
// Inline notes had to be hand-edited for every release and were silently reused
// if that was forgotten, which would publish the previous version's notes under
// the new tag — a mistake nothing in the pipeline could catch.
//
// Node writes the output rather than a bash heredoc because this runs on the
// Windows runner too, where $GITHUB_OUTPUT is a Windows path and shell heredocs
// are the fragile part of the job.
import { appendFile, readFile } from "node:fs/promises";

const rawTag = process.argv[2] || process.env.GITHUB_REF_NAME;
const tag = rawTag?.startsWith("v") ? rawTag : `v${rawTag ?? ""}`;

if (!tag || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  throw new Error(`Release tag must be a SemVer tag, received: ${rawTag || "<empty>"}`);
}

const notesPath = `docs/releases/${tag}.md`;
let body;
try {
  body = await readFile(notesPath, "utf8");
} catch {
  throw new Error(
    `Missing release notes at ${notesPath}. Write them before tagging — the release would otherwise carry no description.`,
  );
}

if (!body.trim()) {
  throw new Error(`${notesPath} is empty.`);
}

// The heredoc-style delimiter must not appear in the content, or the output
// would be truncated at that line.
const delimiter = "RELEASE_NOTES_EOF";
if (body.includes(delimiter)) {
  throw new Error(`${notesPath} must not contain the output delimiter ${delimiter}.`);
}

const outputPath = process.env.GITHUB_OUTPUT;
if (!outputPath) {
  // Allow running locally to validate the notes without a workflow.
  console.log(body);
  console.error(`\n(GITHUB_OUTPUT unset; printed ${notesPath} instead of writing an output.)`);
  process.exit(0);
}

// A newline must separate the body from the closing delimiter or the last line
// is lost, but the body usually ends with one already — normalizing avoids
// adding a stray blank line to the published notes.
const normalized = body.endsWith("\n") ? body : `${body}\n`;
await appendFile(outputPath, `body<<${delimiter}\n${normalized}${delimiter}\n`, "utf8");
console.log(`Loaded release notes from ${notesPath} (${Buffer.byteLength(body, "utf8")} bytes).`);
