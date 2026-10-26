/** Preserve the useful parts of errors returned by EIP-1193 providers. */
export function errorMessage(cause: unknown): string {
  if (typeof cause === "string") return cause;

  if (cause instanceof Error) {
    const code = errorCode(cause);
    return code === undefined
      ? cause.message
      : `${cause.message} (code ${code})`;
  }

  if (cause && typeof cause === "object") {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string") {
      const code = errorCode(cause);
      return code === undefined ? message : `${message} (code ${code})`;
    }
  }

  return "Unknown error";
}

function errorCode(cause: object): string | number | undefined {
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number"
    ? code
    : undefined;
}
