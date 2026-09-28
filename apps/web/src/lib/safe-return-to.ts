/** Only allow same-site relative paths after sign-in, so the link cannot redirect off-site. */
export function safeReturnTo(value: string | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return undefined;
  }
  return value;
}
