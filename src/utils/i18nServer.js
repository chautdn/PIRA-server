const fs = require('fs');
const path = require('path');

// Simple server-side i18n loader (no external deps)
const localesDir = path.join(__dirname, '../locales');
const cache = {};

function loadLocale(locale) {
  if (cache[locale]) return cache[locale];
  try {
    const file = path.join(localesDir, `${locale}.json`);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      cache[locale] = data;
      return data;
    }
  } catch (err) {
    console.error('Failed to load locale', locale, err);
  }
  return {};
}

function getByPath(obj, pathStr) {
  if (!obj) return undefined;
  const parts = pathStr.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur[p] === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolate(str, vars = {}) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/{{\s*(\w+)\s*}}/g, (_, name) => (vars[name] !== undefined ? vars[name] : `{{${name}}}`));
}

function t(key, locale = 'vi', vars = {}) {
  const data = loadLocale(locale) || {};
  const val = getByPath(data, key);
  if (val === undefined) {
    // fallback to 'vi' then 'en'
    const fallback = getByPath(loadLocale('vi'), key) || getByPath(loadLocale('en'), key) || key;
    return interpolate(fallback, vars);
  }
  return interpolate(val, vars);
}

module.exports = { t, loadLocale };
