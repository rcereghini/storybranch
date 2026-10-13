// Return a contract-shaped error even if backend configuration fails at import.
export default async function api(request: Request): Promise<Response> {
  if (
    (process.env.STORYBRANCH_MODE ?? "firebase") === "firebase" &&
    !process.env.FIREBASE_SERVICE_ACCOUNT_JSON &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS
  ) {
    return Response.json(
      {
        error: {
          code: "UNAVAILABLE",
          message:
            "This preview’s hosted backend has not been configured yet. Story playback is temporarily unavailable.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { handle } = await import("../api/handler");
    return await handle(request);
  } catch {
    return Response.json(
      {
        error: {
          code: "UNAVAILABLE",
          message:
            "The story service is unavailable. Please try again shortly.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
