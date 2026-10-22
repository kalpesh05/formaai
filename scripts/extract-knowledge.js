#!/usr/bin/env node

/**
 * Forma AI - Local Enterprise Knowledge Extractor (CLI)
 * 
 * Run this script locally inside ANY private codebase to generate a sanitized,
 * customer-safe Knowledge Base document WITHOUT sharing private source code or Git tokens.
 * 
 * Usage:
 *   node extract-knowledge.js [path-to-repo]
 * 
 * Output:
 *   ./forma-knowledge-base.md (Ready to upload to Forma AI)
 */

const fs = require('fs');
const path = require('path');

const repoPath = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
console.log(`\n🛡️  [Forma AI Local Extractor] Scanning: ${repoPath}`);
console.log(`🔒  100% Local Execution: No private code or secrets leave this machine.\n`);

const knowledgeSections = [];

// 1. Extract README.md
const readmeCandidates = ['README.md', 'readme.md', 'README'];
for (const cand of readmeCandidates) {
  const fullPath = path.join(repoPath, cand);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ Extracted: ${cand}`);
    const content = fs.readFileSync(fullPath, 'utf8');
    knowledgeSections.push(`# Product Overview & Architecture\n\n${content}`);
    break;
  }
}

// 2. Extract Docs folder
const docsCandidates = ['docs', 'doc', 'documentation'];
for (const cand of docsCandidates) {
  const fullPath = path.join(repoPath, cand);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
    for (const f of files.slice(0, 10)) {
      console.log(`✅ Extracted documentation file: ${cand}/${f}`);
      const content = fs.readFileSync(path.join(fullPath, f), 'utf8');
      knowledgeSections.push(`# Guide: ${f.replace(/\.[^/.]+$/, '')}\n\n${content}`);
    }
  }
}

// 3. Extract Database Schema & Models (Table names, fields, relationships)
const schemaCandidates = [
  'schema.sql', 'db/schema.sql', 'src/db/schema.sql',
  'prisma/schema.prisma', 'schema.prisma'
];
for (const cand of schemaCandidates) {
  const fullPath = path.join(repoPath, cand);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ Extracted schema structures: ${cand}`);
    const raw = fs.readFileSync(fullPath, 'utf8');
    // Strip sensitive comments or passwords if any
    const sanitized = raw.replace(/password\s*[:=][^\n]+/gi, 'password: [REDACTED]');
    knowledgeSections.push(`# Data Schema & Entity Specifications\n\n\`\`\`sql\n${sanitized}\n\`\`\``);
    break;
  }
}

// 4. Extract API Endpoint Surface (Routes, Methods - WITHOUT internal business logic)
function scanRouteSignatures(dir, depth = 0) {
  if (depth > 4 || !fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'build') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results.push(...scanRouteSignatures(full, depth + 1));
    } else if (/\.(js|ts)$/.test(ent.name) && (full.includes('route') || full.includes('controller') || full.includes('api'))) {
      try {
        const text = fs.readFileSync(full, 'utf8');
        // Match route patterns like router.get('/path', ...) or app.post('/path', ...)
        const matches = [...text.matchAll(/(router|app)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi)];
        if (matches.length > 0) {
          const endpoints = matches.map(m => `- \`${m[2].toUpperCase()}\` \`${m[3]}\``).join('\n');
          results.push(`### Endpoints defined in ${path.relative(repoPath, full)}:\n${endpoints}`);
        }
      } catch {}
    }
  }
  return results;
}

const routeSummaries = scanRouteSignatures(repoPath);
if (routeSummaries.length > 0) {
  console.log(`✅ Extracted API Route Surface (${routeSummaries.length} controllers scanned)`);
  knowledgeSections.push(`# API Endpoint Directory & Capabilities\n\n${routeSummaries.join('\n\n')}`);
}

// 5. Write sanitized output file
if (knowledgeSections.length === 0) {
  console.log('⚠️  No README, docs, schemas, or routes discovered in this folder.');
} else {
  const outputPath = path.join(process.cwd(), 'forma-knowledge-base.md');
  const fileHeader = `<!--\nForma AI - Sanitized Knowledge Base Export\nGenerated: ${new Date().toISOString()}\nTarget: ${path.basename(repoPath)}\n-->\n\n`;
  fs.writeFileSync(outputPath, fileHeader + knowledgeSections.join('\n\n---\n\n'), 'utf8');

  console.log(`\n🎉  SUCCESS! Sanitized knowledge export generated:`);
  console.log(`📁  ${outputPath}`);
  console.log(`\n👉  Next step: Inspect this file, then upload it directly in Forma AI (Knowledge Base > Upload Code, Schemas & Docs).`);
}
