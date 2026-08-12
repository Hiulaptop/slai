import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

// Compiles a real Tailwind stylesheet covering exactly a known, whitelisted
// set of utility class names - via @tailwindcss/cli's `@source inline(...)`
// directive (Tailwind v4), which generates CSS for literal class names
// without scanning any files - see design.md's "Render output has two
// modes" decision in openspec/changes/add-tailwind-text-styling/. Preflight/
// base reset is intentionally excluded (only the theme + utilities layers
// are imported) so this stylesheet can be embedded into a document that
// already has its own complete inline styling, without Tailwind's reset
// silently overriding it.
//
// This is the only place in the runtime request path that invokes Tailwind
// at all - the whitelist/resolution modules never do (see
// tailwind-whitelist.ts), and this module is only ever called from the
// render/download route handlers, never per keystroke/drag in the editor.

// Deliberately plain filesystem I/O (fs.readFileSync), never `require()`/
// `import()`: those get statically traced and bundled by Next.js's Turbopack
// build (which fails - a dynamically computed module specifier isn't
// resolvable at bundle time), even though the actual path is only known at
// runtime. `@tailwindcss/cli` is a direct devDependency, so pnpm always
// creates a real top-level `node_modules/@tailwindcss/cli` symlink for it
// (only *transitive* deps are pnpm-nested-only) - reading its package.json
// as data, not as a module, sidesteps the bundler entirely.
function resolveTailwindCliEntry(): string {
  const packageDir = path.join(process.cwd(), "node_modules", "@tailwindcss", "cli");
  const packageJson = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf-8")) as { bin: Record<string, string> };
  return path.join(packageDir, packageJson.bin.tailwindcss);
}

export class TailwindCompileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TailwindCompileError";
  }
}

// `source(none)` on both imports disables Tailwind v4's automatic content
// detection (which otherwise scans the `--cwd` directory tree for template
// files and would pull in every utility class used anywhere in this whole
// project, not just the ones this document actually needs). With scanning
// disabled, `@source inline(...)` is the only source of truth for which
// utilities get generated - exactly the known, whitelisted class list this
// function is given.
function buildInputCss(classNames: string[]): string {
  const inlineSource = classNames.join(" ").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `@import "tailwindcss/theme" layer(theme) source(none);\n@import "tailwindcss/utilities" layer(utilities) source(none);\n@source inline("${inlineSource}");\n`;
}

export async function compileTailwindStylesheet(classNames: string[]): Promise<string> {
  if (!classNames.length) return "";

  let cliEntry: string;
  try {
    cliEntry = resolveTailwindCliEntry();
  } catch (error) {
    throw new TailwindCompileError("Could not locate the installed @tailwindcss/cli package", { cause: error });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry, "-i", "-", "--cwd", process.cwd(), "--minify"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => reject(new TailwindCompileError(`Failed to start the Tailwind CLI: ${error.message}`, { cause: error })));
    child.on("close", (code) => {
      if (code !== 0) reject(new TailwindCompileError(`Tailwind CLI exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
      else resolve(stdout);
    });

    child.stdin.write(buildInputCss(classNames));
    child.stdin.end();
  });
}
