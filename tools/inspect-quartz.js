const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function fail(message) {
  console.error(`Quartz Inspect Error: ${message}`);
  process.exit(1);
}

const file = process.argv[2];

if (!file) {
  fail('Usage: node tools/inspect-quartz.js <file.quartz>');
}

const packagePath = path.resolve(file);

if (!fs.existsSync(packagePath)) {
  fail(`File does not exist: ${packagePath}`);
}

const zip = new AdmZip(packagePath);
const manifestEntry = zip.getEntry('quartz.json');

if (!manifestEntry) {
  fail('Missing quartz.json');
}

let manifest;

try {
  manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
} catch (error) {
  fail(`Invalid quartz.json: ${error.message}`);
}

console.log('Quartz Package');
console.log('==============');
console.log(`File: ${packagePath}`);
console.log(`ID: ${manifest.id || 'Missing'}`);
console.log(`Name: ${manifest.name || 'Missing'}`);
console.log(`Developer: ${manifest.developer || 'Missing'}`);
console.log(`Version: ${manifest.version || 'Missing'}`);
console.log(`Engine: ${manifest.engine || 'Missing'}`);
console.log(`Category: ${manifest.category || 'Missing'}`);
console.log(`Entry: ${manifest.entry || 'Missing'}`);
console.log('');
console.log('Files:');

for (const entry of zip.getEntries()) {
  console.log(`- ${entry.entryName}`);
}
