// Genera public/data/items.json a partir de los dumps oficiales del juego (ao-data/ao-bin-dumps).
// Uso: npm run data            (descarga los dumps y los guarda en scripts/.cache)
//      npm run data -- --cached (reutiliza los dumps ya descargados)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, '..', 'public', 'data', 'items.json');
const BASE = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master';

async function load(file, url) {
  const p = path.join(CACHE, file);
  if (!process.argv.includes('--cached') || !fs.existsSync(p)) {
    console.log('Descargando', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(p, await res.text());
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const num = (x, d = 0) => (x == null || x === '' ? d : Number(x));

const dump = (await load('items.json', `${BASE}/items.json`)).items;
const localized = await load('formatted-items.json', `${BASE}/formatted/items.json`);

// Nombres localizados por ID de mercado
const names = new Map();
for (const it of localized) {
  const n = it.LocalizedNames;
  if (n) names.set(it.UniqueName, [n['EN-US'] ?? it.UniqueName, n['ES-ES'] ?? n['EN-US'] ?? it.UniqueName]);
}

// Índice de todos los items del dump
const raw = new Map();
for (const [kind, list] of Object.entries(dump)) {
  if (!Array.isArray(list)) continue;
  for (const x of list) raw.set(x['@uniquename'], { kind, x });
}

// ID de mercado de un recurso de receta: si tiene nivel de encantamiento se añade @n
const resId = (r) => {
  const e = num(r['@enchantmentlevel']);
  return e > 0 ? `${r['@uniquename']}@${e}` : r['@uniquename'];
};

// Recetas alternativas con tokens de facción o de favor no tienen precio de mercado: se descartan
const BAD_RES = /FACTION_.*_TOKEN|ARTEFACT_TOKEN_FAVOR|UNIQUE_GVGTOKEN|QUESTITEM|_TOKEN_/;
const pickRecipe = (reqs) => arr(reqs).find((r) => arr(r.craftresource).every((c) => !BAD_RES.test(c['@uniquename'])));

// Valor de item (base de la tarifa de estación). Se calcula recursivamente cuando el dump no lo trae.
const valueCache = new Map();
function itemValue(id, depth = 0) {
  if (valueCache.has(id)) return valueCache.get(id);
  if (depth > 6) return 0;
  const [base, ench] = id.split('@');
  const entry = raw.get(base);
  let v = 0;
  if (entry) {
    const x = entry.x;
    if (x['@itemvalue'] != null && Number(x['@itemvalue']) > 0) v = Number(x['@itemvalue']);
    else {
      const reqs = ench ? arr(x.enchantments?.enchantment).find((e) => num(e['@enchantmentlevel']) === num(ench))?.craftingrequirements : x.craftingrequirements;
      const rec = pickRecipe(reqs);
      if (rec) {
        const amount = num(rec['@amountcrafted'], 1);
        v = arr(rec.craftresource).reduce((s, c) => s + itemValue(resId(c), depth + 1) * num(c['@count']), 0) / amount;
      }
    }
  }
  valueCache.set(id, v);
  return v;
}

// Clasificación por actividad
function classify(kind, x) {
  const cat = x['@shopcategory'];
  const sub = x['@shopsubcategory1'];
  if (sub === 'vanity' || cat === 'vanity' || cat === 'other') return null;
  if (cat === 'crafting' && sub === 'refinedresources') return { act: 'refine', cat: 'refined', sub: x['@shopsubcategory2'], bk: `refine:${x['@craftingcategory']}` };
  if (cat === 'consumables' && sub === 'food') return { act: 'cook', cat: 'food', sub: x['@shopsubcategory2'] ?? 'food', bk: 'food' };
  if (cat === 'farming' && sub === 'farmingproducts' && x['@craftingcategory'] === 'food') return { act: 'cook', cat: 'ingredients', sub: 'ingredients', bk: 'food' };
  if (cat === 'consumables' && sub === 'potions') return { act: 'alchemy', cat: 'potions', sub: x['@shopsubcategory2'] ?? 'potions', bk: 'potions' };
  if (cat === 'gathering' && (kind === 'equipmentitem' || kind === 'weapon')) return { act: 'craft', cat: 'gathering', sub: kind === 'weapon' ? 'tools' : 'gear', bk: 'gathering' };
  if (['weapons', 'armors', 'head', 'shoes', 'offhands', 'capes', 'bags', 'mounts'].includes(cat)) {
    if (cat === 'capes' && sub !== 'other') return { act: 'craft', cat: 'capes', sub: 'capes', bk: 'capes' };
    if (cat === 'offhands') return { act: 'craft', cat, sub, bk: 'offhands' };
    if (cat === 'bags') return { act: 'craft', cat, sub, bk: 'bags' };
    if (cat === 'mounts') return { act: 'craft', cat, sub, bk: 'mounts' };
    return { act: 'craft', cat, sub, bk: sub };
  }
  return null;
}

const recipes = [];
const usedIds = new Set();
const missing = new Set();

function addRecipe(id, cls, tier, ench, rec) {
  if (!rec) return;
  const res = arr(rec.craftresource).map((c) => [resId(c), num(c['@count']), c['@maxreturnamount'] === '0' ? 0 : 1]);
  if (!res.length) return;
  for (const [r] of res) {
    usedIds.add(r);
    if (!names.has(r)) missing.add(r);
  }
  if (!names.has(id)) return; // no se comercia en el mercado
  usedIds.add(id);
  const value = res.reduce((s, [r, n]) => s + itemValue(r) * n, 0);
  recipes.push({
    id, ...cls, t: tier, e: ench,
    a: num(rec['@amountcrafted'], 1),
    f: num(rec['@craftingfocus']),
    s: num(rec['@silver']),
    v: Math.round(value * 100) / 100,
    r: res,
  });
}

for (const { kind, x } of raw.values()) {
  const cls = classify(kind, x);
  if (!cls || !x.craftingrequirements) continue;
  const id = x['@uniquename'];
  const tier = num(x['@tier']);
  const ownEnch = num(x['@enchantmentlevel']);
  // Recursos refinados encantados son items propios (T5_PLANKS_LEVEL1 -> T5_PLANKS_LEVEL1@1)
  const marketId = ownEnch > 0 ? `${id}@${ownEnch}` : id;
  addRecipe(marketId, cls, tier, ownEnch, pickRecipe(x.craftingrequirements));
  for (const en of arr(x.enchantments?.enchantment)) {
    const e = num(en['@enchantmentlevel']);
    addRecipe(`${id}@${e}`, cls, tier, e, pickRecipe(en.craftingrequirements));
  }
}

const nameOut = {};
for (const id of [...usedIds].sort()) {
  const [base] = id.split('@');
  nameOut[id] = names.get(id) ?? names.get(base) ?? [id, id];
}

const out = { generated: new Date().toISOString(), names: nameOut, recipes };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const counts = recipes.reduce((m, r) => ((m[r.act] = (m[r.act] ?? 0) + 1), m), {});
console.log(`Recetas: ${recipes.length}`, counts, `Nombres: ${usedIds.size}`, `Tamaño: ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
if (missing.size) console.log('Recursos sin nombre localizado:', [...missing].slice(0, 20));
