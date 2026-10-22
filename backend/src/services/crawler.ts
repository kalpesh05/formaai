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
 * Fetches and parses a sitemap.xml or sitemapindex to discover canonical article URLs.
 */
export async function parseSitemapUrls(sitemapUrl: string, maxUrls = 50): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(sitemapUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KromaDesk-Crawler/1.0; +https://kromadesk.ai)',
        'Accept': 'application/xml, text/xml, application/xhtml+xml, text/html, */*'
      }
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const xmlText = await res.text();

    // Extract all <loc> links (including inside CDATA)
    const locMatches = [...xmlText.matchAll(/<loc>(?:<!\[CDATA\[)?\s*(https?:\/\/[^<\]\s]+)\s*(?:\]\]>)?<\/loc>/gi)];
    const urls = locMatches.map(m => m[1].trim());

    if (urls.length === 0) return [];

    // Check if this is a sitemap index pointing to sub-sitemaps (e.g. sitemap-posts.xml, help-sitemap.xml)
    const subSitemaps = urls.filter(u => u.endsWith('.xml') || u.includes('sitemap'));
    if (subSitemaps.length > 0 && subSitemaps.length >= urls.length * 0.7) {
      const combined: string[] = [];
      for (const sub of subSitemaps.slice(0, 5)) {
        const subUrls = await parseSitemapUrls(sub, maxUrls);
        combined.push(...subUrls);
        if (combined.length >= maxUrls) break;
      }
      return combined.slice(0, maxUrls);
    }

    // Filter out non-HTML assets (images, PDFs, css, js)
    const validPageUrls = urls.filter(u => {
      const extMatch = u.match(/\.([a-z0-9]+)$/i);
      if (extMatch && !['html', 'htm'].includes(extMatch[1].toLowerCase())) {
        return false;
      }
      return true;
    });

    return validPageUrls.slice(0, maxUrls);
  } catch (err: any) {
    console.warn(`Sitemap parsing skipped for ${sitemapUrl}:`, err.message);
    return [];
  }
}

/**
 * Recursive Documentation Crawler
 * Crawls a documentation domain starting at rootUrl, extracts main article content
 * stripping sidebars/navbars/footers, and converts to structured Markdown.
 * Supports direct sitemap.xml URLs, sitemap index files, and HTML link crawling.
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
  const queue: string[] = [];
  const results: CrawledPage[] = [];

  // 1. Check if the rootUrl is explicitly a sitemap XML or feed
  const isDirectSitemap = rootUrl.toLowerCase().endsWith('.xml') || rootUrl.toLowerCase().includes('sitemap');
  if (isDirectSitemap) {
    const sitemapUrls = await parseSitemapUrls(rootUrl, maxPages * 2);
    for (const u of sitemapUrls) {
      const clean = normalizeUrl(u);
      if (!visited.has(clean) && !queue.includes(clean)) {
        queue.push(clean);
      }
    }
  }

  // 2. If no direct sitemap was provided or no URLs were returned, seed with rootUrl
  if (queue.length === 0) {
    queue.push(normalizeUrl(rootUrl));

    // Proactively probe for a standard /sitemap.xml to accelerate article discovery
    try {
      const probeSitemap = `${parsedRoot.origin}/sitemap.xml`;
      const autoDiscovered = await parseSitemapUrls(probeSitemap, maxPages);
      for (const u of autoDiscovered) {
        if (u.includes(allowedHostname)) {
          const clean = normalizeUrl(u);
          if (!visited.has(clean) && !queue.includes(clean)) {
            queue.push(clean);
          }
        }
      }
    } catch {
      // Ignore background sitemap discovery errors
    }
  }

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
          'User-Agent': 'Mozilla/5.0 (compatible; KromaDesk-Crawler/1.0; +https://kromadesk.ai)',
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
            // Ignore non-HTML assets
            const extMatch = resolvedUrl.pathname.match(/\.([a-z0-9]+)$/i);
            if (extMatch && !['html', 'htm'].includes(extMatch[1].toLowerCase())) {
              return;
            }

            // Exclude common non-content links
            if (/\/(login|signin|signup|privacy|terms|cart|cdn-cgi)\b/i.test(resolvedUrl.pathname)) {
              return;
            }

            // If it's a dedicated help/docs subdomain, crawl all documentation and article paths on this host
            const isDedicatedDocDomain = allowedHostname.startsWith('help.') || 
                                         allowedHostname.startsWith('docs.') || 
                                         allowedHostname.includes('gitbook') ||
                                         allowedHostname.includes('readme.io') ||
                                         allowedHostname.includes('notion.site');

            if (!isDedicatedDocDomain && basePath) {
              // Extract top-level doc prefix (e.g. /docs from /docs/getting-started)
              const rootPrefix = '/' + basePath.split('/').filter(Boolean)[0];
              if (!resolvedUrl.pathname.startsWith(rootPrefix)) {
                return;
              }
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
        let cleanHtml = article.content.replace(/<img[^>]*>/gi, '');
        const markdown = turndownService.turndown(cleanHtml);
        const title = article.title || document.title || currentUrl;

        const cleanMarkdown = markdown
          .replace(/!\[.*?\]\(.*?\)/g, '')
          .replace(/\[\s*!\[.*?\]\(.*?\)\s*\]\(.*?\)/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        results.push({
          url: currentUrl,
          title: title.trim(),
          markdown: `# ${title}\n\n[Document Source URL: ${currentUrl}]\n\n${cleanMarkdown}`,
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
