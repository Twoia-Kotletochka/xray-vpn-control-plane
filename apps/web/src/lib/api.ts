export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function extractMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.length > 0) {
    return payload;
  }

  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = payload.message;

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    if (Array.isArray(message)) {
      return message.join(', ');
    }
  }

  return fallback;
}

async function parsePayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  return isJson ? await response.json().catch(() => null) : await response.text().catch(() => null);
}

async function throwIfNotOk(response: Response) {
  if (response.ok) {
    return;
  }

  const payload = await parsePayload(response);

  throw new ApiError(
    extractMessage(payload, `Request failed with status ${response.status}`),
    response.status,
    payload,
  );
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  await throwIfNotOk(response);
  const payload = await parsePayload(response);

  return payload as T;
}

export async function requestResponse(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  await throwIfNotOk(response);
  return response;
}
