import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchPublicListings,
  prepareMarketListings,
  readPublicSupabaseConfig,
} from './market-data.mjs';
import { DEFAULT_MIN_PRODUCTS } from './market-policy.mjs';
import { writeMarketArtifacts } from './market-write.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

function parseArgs(argv) {
  const envMinimum = process.env.BELLORE_MARKET_MIN_PRODUCTS;
  const options = { minProducts: envMinimum === undefined ? DEFAULT_MIN_PRODUCTS : Number(envMinimum) };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = argv[++index];
    else if (arg === '--input') options.input = argv[++index];
    else if (arg === '--min-products') options.minProducts = Number(argv[++index]);
    else if (arg === '--help') options.help = true;
    else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  if (!options.help && !options.out) throw new Error('--out 경로가 필요합니다.');
  return options;
}

async function readInput(path) {
  const parsed = JSON.parse(await readFile(resolve(path), 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : parsed.listings;
  if (!Array.isArray(rows)) throw new Error('--input JSON에 listings 배열이 없습니다.');
  return rows;
}

export async function runMarketBuild(options) {
  const rows = options.input
    ? await readInput(options.input)
    : await readPublicSupabaseConfig(joinRoot('supabase-config.js'))
      .then((config) => fetchPublicListings(config));
  const prepared = prepareMarketListings(rows, { minProducts: options.minProducts });
  const artifacts = await writeMarketArtifacts(options.out, prepared.products);
  return { ...prepared.metrics, ...artifacts };
}

function joinRoot(...parts) {
  return resolve(ROOT, ...parts);
}

function printHelp() {
  console.log('사용법: node tools/seo/build-market.mjs --out <dir> [--input <json>] [--min-products <n>]');
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
    } else {
      const result = await runMarketBuild(options);
      console.log(`market build: source=${result.source} excluded=${result.excludedLegacyDemos} hidden=${result.hidden} published=${result.published} urls=${result.sitemapUrls}`);
    }
  } catch (error) {
    console.error(`market build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
