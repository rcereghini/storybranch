import type { ErrorCode } from "../contracts/index";
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export function createApi(
  transport: typeof fetch,
  getToken: () => Promise<string | null>,
) {
  return async <T>(path: string, body?: unknown): Promise<T> => {
    const token = await getToken();
    const response = await transport(`/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw new ApiError(result.error.code, result.error.message);
    return result as T;
  };
}
