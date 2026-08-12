const fs = require('fs');
const path = require('path');
const https = require('https');

const rootDir = path.resolve(__dirname, '..');
const localesDir = path.join(rootDir, 'locales');
const viewsDir = path.join(rootDir, 'views');
const controllersDir = path.join(rootDir, 'controllers');

const supportedLangs = ['tr', 'en', 'el', 'ru', 'fa'];

function loadJson(lang) {
  const filePath = path.join(localesDir, `${lang}.json`);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Error parsing ${lang}.json:`, err.message);
    return {};
  }
}

function saveJson(lang, data) {
  const filePath = path.join(localesDir, `${lang}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const k in obj) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (isObject(obj[k])) {
      keys = keys.concat(getAllKeys(obj[k], full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

function getNestedValue(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;
  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = current[k];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' || typeof current === 'number' ? String(current) : undefined;
}

function setNestedValue(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!current[k] || !isObject(current[k])) {
      current[k] = {};
    }
    current = current[k];
  }
  current[keys[keys.length - 1]] = value;
}

function sortObject(obj) {
  if (!isObject(obj)) return obj;
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    if (isObject(obj[key])) {
      sorted[key] = sortObject(obj[key]);
    } else {
      sorted[key] = obj[key];
    }
  });
  return sorted;
}

function translateText(text, targetLang) {
  return new Promise((resolve) => {
    if (!text || typeof text !== 'string') return resolve(text);
    
    // Protect parameters like {name}, {count}
    const paramMatches = [];
    const protectedText = text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match) => {
      paramMatches.push(match);
      return `___PARAM_${paramMatches.length - 1}___`;
    });

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=tr&tl=${targetLang}&dt=t&q=${encodeURIComponent(protectedText)}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          let translated = parsed[0].map(x => x[0]).join('');
          
          // Restore parameters
          paramMatches.forEach((param, idx) => {
            translated = translated.replace(new RegExp(`___PARAM_${idx}___|___ PARAM_${idx} ___`, 'gi'), param);
          });

          resolve(translated.trim());
        } catch (e) {
          resolve(text); // Fallback to original text on error
        }
      });
    }).on('error', () => resolve(text));
  });
}

// COMMAND 1: CHECK
function checkCmd() {
  console.log('🔍 Checking i18n locale files key parity...\n');
  const locales = {};
  const keysPerLang = {};
  
  supportedLangs.forEach(lang => {
    locales[lang] = loadJson(lang);
    keysPerLang[lang] = new Set(getAllKeys(locales[lang]));
  });

  const trKeys = keysPerLang['tr'];
  let totalMissing = 0;

  console.log(`TR (Base Language) total keys: ${trKeys.size}`);

  supportedLangs.forEach(lang => {
    if (lang === 'tr') return;
    const langKeys = keysPerLang[lang];
    const missingInLang = [...trKeys].filter(k => !langKeys.has(k));
    const extraInLang = [...langKeys].filter(k => !trKeys.has(k));

    console.log(`\n--- Language: ${lang.toUpperCase()} ---`);
    console.log(`Total keys: ${langKeys.size}`);
    
    if (missingInLang.length > 0) {
      console.log(`❌ Missing keys compared to TR (${missingInLang.length}):`);
      missingInLang.slice(0, 10).forEach(k => console.log(`   - ${k}`));
      if (missingInLang.length > 10) console.log(`   ... and ${missingInLang.length - 10} more`);
      totalMissing += missingInLang.length;
    } else {
      console.log(`✅ All ${trKeys.size} keys present.`);
    }

    if (extraInLang.length > 0) {
      console.log(`⚠️ Extra keys not in TR (${extraInLang.length}):`);
      extraInLang.slice(0, 5).forEach(k => console.log(`   - ${k}`));
    }
  });

  console.log(`\n========================================`);
  if (totalMissing === 0) {
    console.log(`🎉 100% Key Parity across all languages!`);
  } else {
    console.log(`⚠️ Found ${totalMissing} missing keys across languages. Run 'npm run i18n:sync' to fix.`);
    process.exit(1);
  }
}

// COMMAND 2: SYNC
async function syncCmd() {
  console.log('🔄 Syncing and translating locale files based on tr.json...\n');
  const trData = loadJson('tr');
  const trKeys = getAllKeys(trData);

  console.log(`Loaded ${trKeys.length} keys from tr.json.`);

  for (const lang of supportedLangs) {
    if (lang === 'tr') {
      saveJson('tr', sortObject(trData));
      continue;
    }

    console.log(`\nProcessing language '${lang.toUpperCase()}'...`);
    const langData = loadJson(lang);
    let addedCount = 0;

    for (const key of trKeys) {
      const existingVal = getNestedValue(langData, key);
      if (existingVal === undefined) {
        const trVal = getNestedValue(trData, key);
        if (trVal) {
          process.stdout.write(`  Translating '${key}'... `);
          const translatedVal = await translateText(trVal, lang);
          setNestedValue(langData, key, translatedVal);
          console.log(`-> "${translatedVal}"`);
          addedCount++;
        }
      }
    }

    saveJson(lang, sortObject(langData));
    console.log(`✅ Finished '${lang.toUpperCase()}': ${addedCount} new translations added.`);
  }

  console.log('\n🎉 Sync completed for all languages!');
}

// COMMAND 3: SCAN
function findFiles(dir, ext) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(fullPath, ext));
    } else if (file.endsWith(ext)) {
      results.push(fullPath);
    }
  });
  return results;
}

function scanCmd() {
  console.log('🔎 Scanning code for hardcoded text and unregistered t() keys...\n');
  const ejsFiles = findFiles(viewsDir, '.ejs');
  const jsFiles = findFiles(controllersDir, '.js');
  const trData = loadJson('tr');

  const registeredKeys = new Set(getAllKeys(trData));
  const usedKeys = new Set();
  const regexes = [/t\(['"]([^'"]+)['"]/g, /__\(['"]([^'"]+)['"]/g];

  [...ejsFiles, ...jsFiles].forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    regexes.forEach(regex => {
      let match;
      while ((match = regex.exec(content)) !== null) {
        usedKeys.add(match[1]);
      }
    });
  });

  const unregistered = [...usedKeys].filter(k => {
    if (registeredKeys.has(k)) return false;
    // Check namespace fallbacks
    const namespaces = ['nav', 'common', 'listing', 'auth', 'categories', 'home', 'footer', 'admin', 'pages', 'profile_edit', 'report_modal'];
    return !namespaces.some(ns => registeredKeys.has(`${ns}.${k}`));
  });

  if (unregistered.length > 0) {
    console.log(`⚠️ Used t() keys missing from tr.json (${unregistered.length}):`);
    unregistered.forEach(k => console.log(`   - ${k}`));
  } else {
    console.log(`✅ All t() keys in code exist in tr.json.`);
  }

  console.log(`\nScanning EJS files for remaining hardcoded text...`);
  let hardcodedTotal = 0;

  ejsFiles.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(rootDir, filePath);
    const lines = content.split('\n');
    const lineHits = [];

    lines.forEach((line, idx) => {
      const cleanLine = line.replace(/<%[\s\S]*?%>/g, '')
                            .replace(/<[^>]+>/g, '')
                            .trim();
      if (cleanLine.length > 2 && /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(cleanLine)) {
        if (!cleanLine.startsWith('{') && !cleanLine.startsWith('//') && !cleanLine.startsWith('<!--') && !cleanLine.startsWith('const ') && !cleanLine.startsWith('let ') && !cleanLine.startsWith('var ') && !cleanLine.includes('http')) {
          lineHits.push({ line: idx + 1, text: cleanLine });
        }
      }
    });

    if (lineHits.length > 0) {
      hardcodedTotal += lineHits.length;
      console.log(`\n📄 ${relPath} (${lineHits.length} candidates):`);
      lineHits.slice(0, 3).forEach(h => console.log(`   L${h.line}: "${h.text}"`));
    }
  });

  console.log(`\n========================================`);
  console.log(`Total hardcoded candidates remaining: ${hardcodedTotal}`);
}

const command = process.argv[2] || 'check';

if (command === 'check') {
  checkCmd();
} else if (command === 'sync') {
  syncCmd();
} else if (command === 'scan') {
  scanCmd();
} else {
  console.log('Usage: node scripts/i18n-tool.js [check|sync|scan]');
}
