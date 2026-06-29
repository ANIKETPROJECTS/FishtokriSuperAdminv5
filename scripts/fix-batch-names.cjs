"use strict";
/**
 * One-time migration: rename garbled batch numbers across all sub-hub databases.
 * Run: node scripts/fix-batch-names.cjs
 * (NODE_PATH is set by the runner script so 'mongodb' resolves correctly)
 */
const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error("ERROR: MONGODB_URI not set."); process.exit(1); }

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateBatchPrefix(productName) {
  const words = (productName || "").trim().toUpperCase()
    .replace(/[^A-Z\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "BAT";
  if (words.length === 1) return words[0].slice(0, 3).padEnd(3, "X");
  return (words[0].slice(0, 2) + words[1].slice(0, 2)).padEnd(4, "X");
}

function extractPrefixFromName(batchName) {
  if (!batchName || batchName.length < 9) return null;
  const afterDate = batchName.slice(8); // strip YYYYMMDD
  const match = afterDate.match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : null;
}

function getValidSuffix(batchName, prefix) {
  const bn = batchName.toUpperCase();
  const idx = bn.indexOf(prefix);
  if (idx === -1) return null;
  const after = bn.slice(idx + prefix.length);
  return /^\d{1,5}$/.test(after) ? after : null;
}

function toISTDateStr(dateVal) {
  const d = dateVal ? new Date(dateVal) : new Date();
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const mo = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}${mo}${dy}`;
}

// ── Per-DB fix ─────────────────────────────────────────────────────────────────

async function fixSubHubDb(client, dbName, subHubName) {
  const db = client.db(dbName);
  const products = db.collection("products");
  const movements = db.collection("inventory_movements");
  const allProducts = await products.find({}).toArray();

  let batchesFixed = 0, movementsFixed = 0;

  for (const product of allProducts) {
    const batches = Array.isArray(product.batches) ? product.batches : [];
    if (batches.length === 0) continue;

    // Determine canonical prefix for this product
    const sc = ((product.shortCode) || "").trim().toUpperCase();
    let prefix;
    if (sc && /^[A-Z]{2,6}$/.test(sc)) {
      prefix = sc;
    } else {
      const inferred = batches
        .map((b) => extractPrefixFromName(String(b.batchNumber || "")))
        .filter(Boolean);
      if (inferred.length > 0) {
        const freq = {};
        for (const p of inferred) freq[p] = (freq[p] || 0) + 1;
        prefix = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      } else {
        prefix = generateBatchPrefix(product.name || "");
      }
    }

    const validBatches = [];
    const garbledBatches = [];

    for (const b of batches) {
      const bn = String(b.batchNumber || "").trim();
      if (!bn) { garbledBatches.push(b); continue; }
      const suffix = getValidSuffix(bn, prefix);
      if (suffix !== null) validBatches.push({ batch: b, seq: parseInt(suffix, 10) });
      else garbledBatches.push(b);
    }

    if (garbledBatches.length === 0) continue;

    let maxSeq = validBatches.reduce((m, v) => Math.max(m, v.seq), 0);

    // Oldest garbled batches get lower new sequence numbers
    garbledBatches.sort((a, b) => {
      const ta = a.receivedDate ? new Date(a.receivedDate).getTime()
               : a.createdAt   ? new Date(a.createdAt).getTime() : 0;
      const tb = b.receivedDate ? new Date(b.receivedDate).getTime()
               : b.createdAt   ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });

    const renames = new Map();
    for (const b of garbledBatches) {
      maxSeq++;
      const dateStr = toISTDateStr(b.receivedDate || b.createdAt);
      const seqStr = String(maxSeq).padStart(2, "0");
      const newName = `${dateStr}${prefix}${seqStr}`;
      const oldName = String(b.batchNumber || "");
      if (oldName) renames.set(oldName, newName);
      b.batchNumber = newName;
      batchesFixed++;
    }

    await products.updateOne({ _id: product._id }, { $set: { batches } });

    for (const [oldName, newName] of renames) {
      if (!oldName) continue;
      const r = await movements.updateMany({ batchNumber: oldName }, { $set: { batchNumber: newName } });
      movementsFixed += r.modifiedCount;
    }

    if (renames.size > 0) {
      console.log(`  [${subHubName}] ${product.name}: renamed ${renames.size} batch(es)`);
      for (const [o, n] of renames) {
        console.log(`    "${o || "(empty)"}"  →  "${n}"`);
      }
    }
  }

  return { batchesFixed, movementsFixed };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log("Connected to MongoDB.\n");

  const adminDb = client.db("fishtokri_admin");
  const subHubs = await adminDb.collection("sub_hubs").find({}).toArray();

  if (subHubs.length === 0) {
    console.log("No sub-hubs found — nothing to do.");
    await client.close();
    return;
  }

  let totalBatches = 0, totalMovements = 0;

  for (const sh of subHubs) {
    if (!sh.dbName) { console.log(`Skipping "${sh.name}" — no dbName.`); continue; }
    console.log(`Processing: ${sh.name}  (db: ${sh.dbName})`);
    const { batchesFixed, movementsFixed } = await fixSubHubDb(client, sh.dbName, sh.name);
    console.log(`  → ${batchesFixed} batch name(s) fixed, ${movementsFixed} movement record(s) updated.\n`);
    totalBatches += batchesFixed;
    totalMovements += movementsFixed;
  }

  console.log("─".repeat(60));
  console.log(`Migration complete.`);
  console.log(`  Total batch names fixed    : ${totalBatches}`);
  console.log(`  Total movements updated    : ${totalMovements}`);

  await client.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
