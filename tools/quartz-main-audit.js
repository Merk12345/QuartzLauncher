const fs = require("fs");

const file = "main.js";
const text = fs.readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);

const handleRegex = /ipcMain\.handle\(['"`]([^'"`]+)['"`]/;
const removeRegex = /ipcMain\.removeHandler\(['"`]([^'"`]+)['"`]/;
const functionRegex = /^(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/;

const handles = new Map();
const removes = new Map();
const functions = new Map();

lines.forEach((line, index) => {
  const lineNo = index + 1;

  const handleMatch = line.match(handleRegex);
  if (handleMatch) {
    const name = handleMatch[1];
    if (!handles.has(name)) handles.set(name, []);
    handles.get(name).push(lineNo);
  }

  const removeMatch = line.match(removeRegex);
  if (removeMatch) {
    const name = removeMatch[1];
    if (!removes.has(name)) removes.set(name, []);
    removes.get(name).push(lineNo);
  }

  const fnMatch = line.match(functionRegex);
  if (fnMatch) {
    const name = fnMatch[1];
    if (!functions.has(name)) functions.set(name, []);
    functions.get(name).push(lineNo);
  }
});

function printMap(title, map, onlyDuplicates = false) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));

  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [name, lineNumbers] of entries) {
    if (onlyDuplicates && lineNumbers.length <= 1) continue;
    console.log(`${name}: ${lineNumbers.length} time(s) at lines ${lineNumbers.join(", ")}`);
  }
}

console.log("Quartz main.js audit");
console.log("====================");
console.log(`Lines: ${lines.length}`);
console.log(`ipcMain.handle count: ${[...handles.values()].reduce((sum, x) => sum + x.length, 0)}`);
console.log(`ipcMain.removeHandler count: ${[...removes.values()].reduce((sum, x) => sum + x.length, 0)}`);
console.log(`Named function count: ${[...functions.values()].reduce((sum, x) => sum + x.length, 0)}`);

printMap("Duplicate IPC handlers", handles, true);
printMap("Duplicate named functions", functions, true);

console.log("");
console.log("Final effective IPC handlers");
console.log("----------------------------");

for (const [name, lineNumbers] of [...handles.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const last = lineNumbers[lineNumbers.length - 1];
  console.log(`${name}: final handler starts at line ${last}`);
}

console.log("");
console.log("Recommended cleanup order");
console.log("-------------------------");
console.log("1. Keep app working.");
console.log("2. Do not remove old blocks yet.");
console.log("3. Extract clean final handlers into docs first.");
console.log("4. Replace main.js only after smoke + runtime tests are passing.");
