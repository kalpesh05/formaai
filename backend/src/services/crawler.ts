import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface CrawledPage {
  url: string;
  title: string;
  markdown: string;
}

export interface CrawlOptions {
  maxPages?: number;
  timeoutMs?: number;
}

/**
 * Recursive Documentation Crawler
 * Crawls a documentation domain starting at rootUrl, extracts main article content
 * stripping sidebars/navbars/footers, and converts to structured Markdown.
 */
export async function crawlDocumentationSite(
  rootUrl: string,
  options: CrawlOptions = {}
): Promise<CrawledPage[]> {
  const { maxPages = 15, timeoutMs = 8000 } = options;

  const parsedRoot = new URL(rootUrl);
  const allowedHostname = parsedRoot.hostname;
  const basePath = parsedRoot.pathname.replace(/\/$/, '');

  const visited = new Set<string>();
  const queue: string[] = [normalizeUrl(rootUrl)];
  const results: CrawledPage[] = [];

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  while (queue.length > 0 && results.length < maxPages) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FormaAI-Crawler/1.0; +https://forma.ai)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timer);

      if (!response.ok) continue;
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) continue;

      const html = await response.text();
      const dom = new JSDOM(html, { url: currentUrl });
      const document = dom.window.document;

      // Extract discovered internal links before modifying DOM
      const links = document.querySelectorAll('a[href]');
      links.forEach((anchor) => {
        try {
          const href = anchor.getAttribute('href');
          if (!href) return;
          const resolvedUrl = new URL(href, currentUrl);
          
          // Only crawl within the same hostname
          if (resolvedUrl.hostname === allowedHostname) {
            // Only crawl paths within base documentation path if provided
            if (basePath && !resolvedUrl.pathname.startsWith(basePath)) {
              return;
            }
            
            // Ignore non-HTML assets
            const extMatch = resolvedUrl.pathname.match(/\.([a-z0-9]+)$/i);
            if (extMatch && !['html', 'htm'].includes(extMatch[1].toLowerCase())) {
              return;
            }

            const cleanUrl = normalizeUrl(resolvedUrl.href);
            if (!visited.has(cleanUrl) && !queue.includes(cleanUrl)) {
              queue.push(cleanUrl);
            }
          }
        } catch {
          // Ignore invalid URLs
        }
      });

      // Extract main article content with Readability
      const reader = new Readability(document);
      const article = reader.parse();

      if (article && article.content && (article.textContent || '').trim().length > 100) {
        const markdown = turndownService.turndown(article.content);
        const title = article.title || document.title || currentUrl;

        results.push({
          url: currentUrl,
          title: title.trim(),
          markdown: `# ${title}\n\n[Document URL: ${currentUrl}]\n\n${markdown}`,
        });
      }
    } catch (err: any) {
      console.warn(`Crawler skipped ${currentUrl}:`, err.message);
    }
  }

  return results;
}

function normalizeUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    u.hash = ''; // Remove anchor
    u.search = ''; // Strip query parameters for docs
    return u.href.replace(/\/$/, '');
  } catch {
    return urlStr;
  }
}
