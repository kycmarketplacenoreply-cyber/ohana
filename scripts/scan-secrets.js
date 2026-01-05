const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const IGNORE_DIRS = ['.git', 'node_modules', 'dist', 'uploads', 'attached_assets'];
const patterns = [
  /-----BEGIN PRIVATE KEY-----/i,
  /-----BEGIN.*CERTIFICATE-----/i,
  /(?:jwt[_-]?secret|jwtsecret)/i,
  /(?:master_wallet_private_key|MASTER_WALLET_PRIVATE_KEY|PRIVATE_KEY)/i,
  /[A-Za-z0-9_-]{40,}/, // long tokens
  /(?:password\s*=\s*\".*\")/i,
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (IGNORE_DIRS.includes(file)) continue;
      results = results.concat(walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function scan() {
  const files = walk(ROOT);
  const suspicious = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      for (const p of patterns) {
        if (p.test(content)) {
          suspicious.push({ file: f, pattern: p.toString() });
          break;
        }
      }
    } catch (err) {
      // ignore binary files
    }
  }
  if (suspicious.length) {
    console.warn('\nPotential secrets found:');
    suspicious.slice(0, 50).forEach(s => console.warn(` - ${s.file} matches ${s.pattern}`));
    console.warn('\nRun a dedicated secret scanner (gitleaks/trufflehog) and rotate any exposed secrets.');
    process.exitCode = 0; // warn only — CI uses gitleaks for enforcement
  } else {
    console.log('No obvious secrets found by heuristics.');
  }
}

scan();
