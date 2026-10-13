import { readFile, mkdir, writeFile } from "node:fs/promises";
const shell = await readFile("dist/index.html", "utf8");
for (const [path, title, description] of [
  [
    "s/glass-harbor",
    "The Glass Harbor",
    "A city of secrets. One stolen signal. Your way out.",
  ],
  [
    "u/storybranch",
    "Storybranch Studio",
    "Original prototype adventures by Storybranch Studio.",
  ],
]) {
  await mkdir(`dist/${path}`, { recursive: true });
  await writeFile(
    `dist/${path}/index.html`,
    shell.replace(
      "<title>Storybranch · Choose your way</title>",
      `<title>${title} · Storybranch</title><meta property="og:title" content="${title}"/><meta property="og:description" content="${description}"/><meta property="og:type" content="website"/>`,
    ),
  );
}
