// Copies live data from storybranch/app/... into the per-user layout.
//   pnpm migrate:layout            dry run: reports what it would copy
//   pnpm migrate:layout --apply    copies; refuses if anything is unmapped
// Old records are left in place; delete them separately once verified.
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.STORYBRANCH_MODE = "firebase";
const { db, config } = await import("../services/api/firebase");
const { migrateLayout } = await import("./migrate-layout");
const apply = process.argv.includes("--apply");
const report = await migrateLayout(db, { apply });
console.log(`Project ${config.projectId} · ${apply ? "APPLY" : "dry run"}`);
console.table(report.counts);
if (report.unmapped.length)
  console.log("Unmapped (nothing written):", report.unmapped);
if (report.conflicts.length)
  console.log("Edition conflicts (nothing written):", report.conflicts);
if (apply && (report.unmapped.length || report.conflicts.length))
  process.exitCode = 1;
