/**
 * Proxy and Scraper Gateway Helper
 * Enables Cloudflare bypass for 1xBet, Betway, and Soccabet on cloud hosts (e.g. Render, AWS).
 * Supports:
 *   - PROXY_GATEWAY (e.g., https://api.scraperapi.com?api_key=KEY or custom gateway)
 *   - SCRAPER_URL
 *   - Direct fetch fallback
 */

export function formatProxyUrl(targetUrl) {
  const gateway = process.env.PROXY_GATEWAY || process.env.SCRAPER_URL;
  if (!gateway) return targetUrl;

  if (gateway.includes('{url}')) {
    return gateway.replace('{url}', encodeURIComponent(targetUrl));
  }
  const separator = gateway.includes('?') ? '&' : '?';
  return `${gateway}${separator}url=${encodeURIComponent(targetUrl)}`;
}

export function isProxyConfigured() {
  return Boolean(process.env.PROXY_GATEWAY || process.env.SCRAPER_URL || process.env.PROXY_URL || process.env.HTTPS_PROXY);
}
