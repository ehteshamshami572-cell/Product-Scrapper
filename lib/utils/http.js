import { Logger } from "./logger.js";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
];

export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function getDefaultHeaders(customHeaders = {}) {
  return {
    "User-Agent": getRandomUserAgent(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    ...customHeaders,
  };
}

/**
 * Fetch with retry, exponential backoff, rate limit handling, and custom timeouts.
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3, onProgress = null) {
  const timeoutMs = options.timeout || 15000;
  let delay = 1000;

  const fetchOptions = {
    ...options,
    headers: getDefaultHeaders(options.headers || {}),
  };

  // Remove custom timeout from options before calling standard fetch
  delete fetchOptions.timeout;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(id);

      if (response.ok) {
        return response;
      }

      // Handle specific retriable statuses
      if ([403, 429, 500, 502, 503, 504].includes(response.status)) {
        let retryAfter = response.headers.get("Retry-After");
        let waitTime = delay;

        if (response.status === 429 && retryAfter) {
          const seconds = parseInt(retryAfter, 10);
          if (!isNaN(seconds)) {
            waitTime = seconds * 1000;
          } else {
            // It might be an HTTP date string
            const date = Date.parse(retryAfter);
            if (!isNaN(date)) {
              waitTime = Math.max(0, date - Date.now());
            }
          }
        }

        if (attempt === maxRetries) {
          const msg = `Failed after ${maxRetries} attempts. HTTP Status: ${response.status} for ${url}`;
          onProgress?.(msg);
          Logger.error(msg);
          return response;
        }

        const msg = `HTTP Status ${response.status} for ${url}. Retrying in ${waitTime}ms (Attempt ${attempt}/${maxRetries})...`;
        onProgress?.(msg);
        Logger.warn(msg);

        await new Promise((resolve) => setTimeout(resolve, waitTime));
        delay *= 2; // exponential backoff
        continue;
      }

      return response; // Return direct for other non-retriable statuses (e.g. 404, 400)
    } catch (error) {
      clearTimeout(id);

      const isTimeout = error.name === "AbortError";
      const errorMsg = isTimeout ? `Request timed out after ${timeoutMs}ms` : error.message;

      if (attempt === maxRetries) {
        const msg = `Fetch error: ${errorMsg} for ${url} (Failed all ${maxRetries} attempts)`;
        onProgress?.(msg);
        Logger.error(msg);
        throw new Error(msg);
      }

      const msg = `Fetch error: ${errorMsg} for ${url}. Retrying in ${delay}ms (Attempt ${attempt}/${maxRetries})...`;
      onProgress?.(msg);
      Logger.warn(msg);

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/**
 * Executes async operations over items with a concurrency limit.
 */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  const promises = [];
  let index = 0;

  for (const item of items) {
    const currentIndex = index++;
    const p = (async () => {
      try {
        results[currentIndex] = await fn(item, currentIndex);
      } catch (err) {
        Logger.error(`Pool task error at index ${currentIndex}: ${err.message}`);
        results[currentIndex] = null;
      }
    })();
    promises.push(p);

    p.then(() => {
      promises.splice(promises.indexOf(p), 1);
    });

    if (promises.length >= limit) {
      await Promise.race(promises);
    }
  }

  await Promise.all(promises);
  return results;
}
