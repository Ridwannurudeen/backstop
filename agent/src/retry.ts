const TRANSIENT_RE =
  /fetch failed|timeout|aborted|EAI_AGAIN|ENOTFOUND|getaddrinfo|ECONNRESET|ETIMEDOUT/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause instanceof Error
        ? ` ${error.cause.message}`
        : "";
    return `${error.message}${cause}`;
  }
  return String(error);
}

export async function retryTransient<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      const message = messageOf(error);
      if (attempt === 3 || !TRANSIENT_RE.test(message)) throw error;
      console.log(`retry ${label}: ${message}`);
      await sleep(750 * attempt);
    }
  }
  throw last;
}
