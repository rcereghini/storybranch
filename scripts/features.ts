// Turns gated features on or off for an account (users/{uid}.features).
//   pnpm features list
//   pnpm features grant <email|uid> <feature...>
//   pnpm features revoke <email|uid> <feature...>
// Features: publish, generate, copilot, admin (admin implies the others).
// Uses the live project with the local
// server credential; set STORYBRANCH_MODE=emulator to change emulator accounts.
// Changes apply on the account's next request; no redeploy is needed.
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.STORYBRANCH_MODE ??= "firebase";
if (process.env.STORYBRANCH_MODE === "emulator") await import("./local-env");
const { db, auth, config } = await import("../services/api/firebase");
const { storedFeatures, featureId, featureIds } = await import(
  "../packages/contracts/profile"
);
const paths = await import("../services/api/paths");
const { ensurePlayerProfile } = await import("../services/api/player-profile");

const [command, who, ...names] = process.argv.slice(2);

async function resolve(target: string) {
  const record = target.includes("@")
    ? await auth.getUserByEmail(target)
    : await auth.getUser(target);
  return { uid: record.uid, email: record.email ?? "(no email)" };
}

if (command === "list") {
  const users = await db.collection("users").get();
  const rows = await Promise.all(
    users.docs.map(async (d) => {
      const email = await auth
        .getUser(d.id)
        .then((u) => u.email ?? "(no email)")
        .catch(() => "(no auth account)");
      const on = Object.entries(storedFeatures(d.data()))
        .filter(([, value]) => value)
        .map(([feature]) => feature);
      return { email, uid: d.id, features: on.join(", ") || "none" };
    }),
  );
  console.log(`Project ${config.projectId}`);
  console.table(rows);
} else if ((command === "grant" || command === "revoke") && who && names.length) {
  const features = names.map((name) => {
    const parsed = featureId.safeParse(name);
    if (!parsed.success)
      throw new Error(`Unknown feature "${name}". Use: ${featureIds.join(", ")}.`);
    return parsed.data;
  });
  const { uid, email } = await resolve(who);
  const ref = db.doc(paths.user(uid));
  // An account that signed up but never used the app gets the same new
  // profile the app would create on its first request.
  await ensurePlayerProfile(db, uid);
  await ref.update(
    Object.fromEntries(
      features.map((feature) => [`features.${feature}`, command === "grant"]),
    ),
  );
  const now = storedFeatures((await ref.get()).data());
  console.log(
    `${config.projectId}: ${email} (${uid}) now has ${
      featureIds.filter((f) => now[f]).join(", ") || "no features"
    }.`,
  );
} else {
  console.log(
    `Usage:\n  pnpm features list\n  pnpm features grant <email|uid> <${featureIds.join("|")}...>\n  pnpm features revoke <email|uid> <${featureIds.join("|")}...>`,
  );
  process.exitCode = 1;
}
