export function publisherAllowed(
  mode: "firebase" | "emulator",
  uid: string,
  allowlist = "",
) {
  return (
    mode === "emulator" ||
    allowlist
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(uid)
  );
}
