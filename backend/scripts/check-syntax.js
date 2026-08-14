const { execFileSync } = require("node:child_process");
const { readdirSync, statSync } = require("node:fs");
const path = require("node:path");

function javascriptFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    return statSync(absolute).isDirectory() ? javascriptFiles(absolute) : absolute.endsWith(".js") ? [absolute] : [];
  });
}

const root = path.resolve(__dirname, "..");
for (const file of [...javascriptFiles(path.join(root, "src")), ...javascriptFiles(path.join(root, "scripts"))]) {
  if (file === __filename) continue;
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
console.log("Backend JavaScript syntax is valid");
