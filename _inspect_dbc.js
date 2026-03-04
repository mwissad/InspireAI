const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const dbcPath = path.join(__dirname, 'databricks_inspire_v38.dbc');
const outDir = '/tmp/dbc_inspect';

// DBC is a zip file
try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
fs.copyFileSync(dbcPath, path.join(outDir, 'nb.zip'));
execSync(`cd ${outDir} && unzip -o nb.zip`, { stdio: 'inherit' });

// List extracted files
const files = fs.readdirSync(outDir);
console.log('\n=== Extracted files ===');
files.forEach(f => console.log(f));

// Find the python file
const pyFile = files.find(f => f.endsWith('.python'));
if (pyFile) {
  const content = fs.readFileSync(path.join(outDir, pyFile), 'utf8');
  // Find all section headers / markdown headings
  const lines = content.split('\n');
  console.log(`\n=== Total lines: ${lines.length} ===\n`);
  console.log('=== COMMAND markers and MD headings ===');
  let cmdNum = 0;
  lines.forEach((line, i) => {
    if (line.startsWith('# COMMAND ----------')) {
      cmdNum++;
    }
    if (line.startsWith('# MAGIC %md')) {
      console.log(`Line ${i+1} (cmd ${cmdNum}): ${line.substring(0, 150)}`);
    }
    if (line.match(/^# MAGIC\s+#{1,3}\s/)) {
      console.log(`Line ${i+1} (cmd ${cmdNum}): ${line.substring(0, 150)}`);
    }
  });
  
  console.log(`\n=== Total COMMAND sections: ${cmdNum} ===`);
}
