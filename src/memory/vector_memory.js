import fs from 'fs';
import path from 'path';
import { create, insert, search } from '@orama/orama';
import { pipeline, env } from '@xenova/transformers';
import { getDataDir } from '../system/config.js';

const noaDir = getDataDir();
if (!fs.existsSync(noaDir)) {
  fs.mkdirSync(noaDir, { recursive: true });
}

const modelsDir = path.join(noaDir, 'models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

env.cacheDir = modelsDir;
env.localModelPath = modelsDir;
env.allowRemoteModels = true;

const VECTOR_DB_PATH = path.join(noaDir, 'vector_memory.json');

let extractor = null;
let memoryData = null;
let oramaDb = null;

export async function initExtractor(progressCallback) {
  if (!extractor) {
    console.log("Loading embedding model...");
    let opts = {};
    if (progressCallback) opts.progress_callback = progressCallback;
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', opts);
  }
  return extractor;
}

async function loadMemoryData() {
  if (memoryData && oramaDb) return memoryData;
  
  oramaDb = await create({
    schema: {
      text: 'string',
      role: 'string',
      timestamp: 'string',
      embedding: 'vector[384]' 
    }
  });

  if (fs.existsSync(VECTOR_DB_PATH)) {
    try {
      const data = JSON.parse(await fs.promises.readFile(VECTOR_DB_PATH, 'utf8'));
      memoryData = Array.isArray(data) ? data : [];
      
      // Clean up legacy schema
      if (memoryData.length > 0 && memoryData[0].vector && !memoryData[0].embedding) {
          for (const item of memoryData) {
              if (item.vector) {
                  item.embedding = item.vector;
                  delete item.vector;
              }
          }
      }

      for (const item of memoryData) {
        if (item.embedding && item.embedding.length === 384) {
            await insert(oramaDb, {
                text: item.text,
                role: item.role,
                timestamp: item.timestamp,
                embedding: item.embedding
            });
        }
      }
    } catch (e) {
      console.error("Error loading vector memory:", e);
      memoryData = [];
    }
  } else {
    memoryData = [];
  }
  return memoryData;
}

async function saveMemoryData() {
  if (memoryData) {
    await fs.promises.writeFile(VECTOR_DB_PATH, JSON.stringify(memoryData), 'utf8');
  }
}

export async function saveVectorMemory(text, role, progressCallback) {
  if (!text || text.trim() === '') return;
  const ext = await initExtractor(progressCallback);
  const startExt = Date.now();
  const output = await ext(text, { pooling: 'mean', normalize: true });
  console.log(`[Timing] Vector embedding extraction (save) took ${Date.now() - startExt}ms`);
  const embedding = Array.from(output.data);
  
  const data = await loadMemoryData();
  
  const newMem = {
    embedding: embedding,
    text: text,
    role: role,
    timestamp: new Date().toISOString()
  };
  
  data.push(newMem);
  if (oramaDb && embedding.length === 384) {
      await insert(oramaDb, newMem);
  }
  await saveMemoryData();
}

export async function queryVectorMemory(queryText, topK = 5, progressCallback) {
  const ext = await initExtractor(progressCallback);
  const startExt = Date.now();
  const output = await ext(queryText, { pooling: 'mean', normalize: true });
  console.log(`[Timing] Vector embedding extraction (query) took ${Date.now() - startExt}ms`);
  const queryEmbedding = Array.from(output.data);

  await loadMemoryData(); // Ensure Orama is loaded
  
  if (!oramaDb) return [];
  
  try {
      const results = await search(oramaDb, {
          mode: 'vector',
          vector: {
              value: queryEmbedding,
              property: 'embedding'
          },
          limit: topK
      });
      
      return results.hits.map(hit => hit.document).filter(r => r.text !== "dummy");
  } catch (e) {
      console.error("Orama search error:", e);
      return [];
  }
}

