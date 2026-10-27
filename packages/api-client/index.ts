import {
  battleContractHeader,
  battleContractVersion,
} from "../contracts/battle-player";
import {
  playerContractHeader,
  playerContractVersion,
} from "../contracts/player";
import type { ErrorCode } from "../contracts/index";
import {
  storyContractHeader,
  storyContractVersion,
} from "../contracts/legacy-story-format";
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
        [storyContractHeader]: storyContractVersion,
        ...(/^\/playthroughs(?:[/?]|$)/.test(path)
          ? {
              [playerContractHeader]: playerContractVersion,
              [battleContractHeader]: battleContractVersion,
            }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new ApiError(
        "UNAVAILABLE",
        "The story service is unavailable. Please try again shortly.",
      );
    }
    if (!response.ok) {
      const error = result?.error;
      if (
        error &&
        typeof error.message === "string" &&
        [
          "UNAUTHENTICATED",
          "FORBIDDEN",
          "NOT_FOUND",
          "STALE_REVISION",
          "IDEMPOTENCY_CONFLICT",
          "VALIDATION_FAILED",
          "UNAVAILABLE",
        ].includes(error.code)
      )
        throw new ApiError(error.code, error.message);
      throw new ApiError(
        "UNAVAILABLE",
        "The story service is unavailable. Please try again shortly.",
      );
    }
    return result as T;
  };
}
