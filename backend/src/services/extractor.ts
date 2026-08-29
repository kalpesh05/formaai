import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

// Polyfills for Node 18 compatibility with newer pdfjs-dist versions
if (typeof (global as any).DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {};
}
if (typeof (global as any).ImageData === 'undefined') {
  (global as any).ImageData = class ImageData {};
}
if (typeof (global as any).Path2D === 'undefined') {
  (global as any).Path2D = class Path2D {};
}

// pdf-parse does not ship with TypeScript types, load via CommonJS require
const pdfParse = require('pdf-parse');

/**
 * Extracts raw text content from uploaded files depending on the file type (PDF, DOCX, CSV, TXT).
 */
export async function extractTextFromFile(filePath: string, originalName: string): Promise<string> {
  const extension = path.extname(originalName).toLowerCase();
  
  if (extension === '.txt') {
    return fs.readFileSync(filePath, 'utf8');
  }
  
  if (extension === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);
    return parsed.text || '';
  }
  
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  }
  
  if (extension === '.csv') {
    return fs.readFileSync(filePath, 'utf8');
  }
  
  throw new Error(`Unsupported file type: ${extension}`);
}

/**
 * Scrapes HTML from a web page (e.g. support centers), strips navigation/boilerplate 
 * using Readability, and converts the clean article structure into Markdown.
 */
export async function extractTextFromUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP Error: Failed to fetch url (${response.status} ${response.statusText})`);
  }
  
  const html = await response.text();
  
  // Extract main article body using JSDOM + Readability
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  
  if (!article || !article.content) {
    throw new Error('Failed to parse main text content from this page.');
  }

  // Convert cleaned HTML output to readable Markdown format
  const turndownService = new TurndownService();
  const markdown = turndownService.turndown(article.content);
  
  return `# ${article.title || 'Web Document'}\n\n${markdown}`;
}
