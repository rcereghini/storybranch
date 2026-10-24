import { FieldPath } from "firebase-admin/firestore";
import {
  defaultAiPrices,
  type AiUsage,
  type AiUsageDay,
  type AiUsageReport,
  type AiUsageTotals,
} from "../../packages/contracts/usage";
import {
  addTotals,
  dayRange,
  emptyTotals,
  usageTotals,
} from "../../packages/domain/usage";
import { auth, db } from "./firebase";
import * as paths from "./paths";

// Enough per-user records for a quarter of alpha traffic; a busier app
// needs pre-summed monthly records instead.
const maxUserRecords = 5000;

export async function aiUsageDays(count: number): Promise<AiUsageDay[]> {
  const range = dayRange(Date.now(), count);
  const docs = await db
    .collection("aiUsage")
    .where(FieldPath.documentId(), ">=", range[0])
    .where(FieldPath.documentId(), "<=", range.at(-1)!)
    .get();
  const byDay = new Map(docs.docs.map((d) => [d.id, d.data() as AiUsage]));
  return range.map((day) => ({
    day,
    claude: byDay.get(day)?.claude ?? {},
    images: byDay.get(day)?.images ?? {},
  }));
}

export async function usageReport(count: number): Promise<AiUsageReport> {
  const prices = defaultAiPrices;
  const days = await aiUsageDays(count);
  const from = days[0].day;
  const userDocs = await db
    .collection("aiUsageUsers")
    .where("day", ">=", from)
    .limit(maxUserRecords)
    .get();
  const perUser = new Map<string, AiUsageTotals>();
  for (const d of userDocs.docs) {
    const data = d.data() as AiUsage & { uid: string };
    perUser.set(
      data.uid,
      addTotals(
        perUser.get(data.uid) ?? emptyTotals(),
        usageTotals(data, prices),
      ),
    );
  }
  const top = [...perUser.entries()]
    .sort(
      ([, a], [, b]) =>
        b.estimatedUsd - a.estimatedUsd ||
        b.claudeRequests + b.images - (a.claudeRequests + a.images),
    )
    .slice(0, 20);
  const [accounts, profiles] = top.length
    ? await Promise.all([
        auth.getUsers(top.map(([uid]) => ({ uid }))),
        db.getAll(...top.map(([uid]) => db.doc(paths.user(uid)))),
      ])
    : [{ users: [] }, []];
  const account = new Map(accounts.users.map((u) => [u.uid, u]));
  const name = new Map(
    profiles.map((p) => [p.id, p.data()?.displayName as unknown]),
  );
  const withTotals = days.map((day) => ({
    ...day,
    totals: usageTotals(day, prices),
  }));
  return {
    from,
    to: days.at(-1)!.day,
    days: withTotals,
    totals: withTotals.reduce(
      (sum, d) => addTotals(sum, d.totals),
      emptyTotals(),
    ),
    byFeature: {
      copilot: sumFeature(days, "copilot"),
      assist: sumFeature(days, "assist"),
      image: sumFeature(days, "image"),
    },
    topUsers: top.map(([uid, totals]) => ({
      uid,
      email: account.get(uid)?.email ?? null,
      displayName:
        (typeof name.get(uid) === "string" && (name.get(uid) as string)) ||
        account.get(uid)?.displayName ||
        "Player",
      ...totals,
    })),
    prices,
  };

  function sumFeature(
    list: AiUsageDay[],
    feature: "copilot" | "assist" | "image",
  ) {
    return list.reduce(
      (sum, day) => addTotals(sum, usageTotals(day, prices, feature)),
      emptyTotals(),
    );
  }
}
