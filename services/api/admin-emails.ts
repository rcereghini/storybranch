import { randomUUID } from "node:crypto";
import { GameError } from "../../packages/contracts/index";
import {
  adminEmailCommandSchema,
  emailContentSchema,
  emailTemplateId,
  emailTemplateIds,
  emailTemplates,
  sampleEmailLink,
  type AdminEmailTemplate,
  type AdminEmails,
  type AdminEmailVersion,
  type EmailContent,
  type EmailLogEntry,
  type EmailTemplateId,
} from "../../packages/contracts/email";
import { db } from "./firebase";
import { AUDIT, run } from "./admin-audit";
import { limit, sendSystemEmail, senderConfigured, siteUrl } from "./email";
import { emailAiAvailable, rewriteEmail } from "./email-ai";

// Admin editing of system emails. emailTemplates/{id} holds the draft, the
// revision and the published version; emailTemplates/{id}/versions/{n} keeps
// every published version, never changed after it is written.
const ref = (id: EmailTemplateId) => db.doc(`emailTemplates/${id}`);
const content = (value: unknown): EmailContent | null => {
  const parsed = emailContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

async function view(id: EmailTemplateId): Promise<AdminEmailTemplate> {
  const definition = emailTemplates[id];
  const [doc, versions] = await Promise.all([
    ref(id).get(),
    ref(id).collection("versions").orderBy("version", "desc").limit(20).get(),
  ]);
  const data = doc.data() ?? {};
  const published = content(data.published?.content);
  return {
    ...definition,
    published:
      published && typeof data.published.version === "number"
        ? { version: data.published.version, content: published }
        : { version: 0, content: definition.defaults },
    draft: content(data.draft),
    revision: typeof data.revision === "number" ? data.revision : 0,
    versions: versions.docs.flatMap((d): AdminEmailVersion[] => {
      const v = d.data();
      const c = content(v.content);
      return c
        ? [
            {
              version: v.version,
              content: c,
              publishedAt: v.publishedAt,
              publishedBy: v.publishedBy ?? null,
            },
          ]
        : [];
    }),
  };
}

export async function listEmails(): Promise<AdminEmails> {
  return {
    templates: await Promise.all(emailTemplateIds.map(view)),
    aiAvailable: emailAiAvailable(),
    senderConfigured: senderConfigured(),
  };
}

export async function emailLog(): Promise<{ items: EmailLogEntry[] }> {
  const docs = await db
    .collection("emailLog")
    .orderBy("at", "desc")
    .limit(100)
    .get();
  return {
    items: docs.docs.map((d) => {
      const e = d.data();
      return {
        id: d.id,
        template: e.template,
        version: e.version,
        test: e.test === true,
        to: e.to,
        uid: e.uid ?? null,
        status: e.status,
        detail: e.detail ?? null,
        at: e.at,
      };
    }),
  };
}

const stale = () =>
  new GameError(
    "STALE_REVISION",
    "This email changed in another tab. Reload it before saving.",
  );

export async function emailCommand(
  uid: string,
  actorEmail: string | null,
  target: string,
  body: unknown,
) {
  const parsedId = emailTemplateId.safeParse(target);
  if (!parsedId.success) throw new GameError("NOT_FOUND", "Email not found.");
  const id = parsedId.data;
  const command = adminEmailCommandSchema.parse(body);
  const template = emailTemplates[id];

  if (command.action === "rewrite")
    return {
      content: await rewriteEmail({
        uid,
        template,
        content: command.content,
        instruction: command.instruction,
      }),
    };

  if (command.action === "test") {
    if (!actorEmail)
      throw new GameError(
        "VALIDATION_FAILED",
        "Your account has no email address to send a test to.",
      );
    await limit(
      `email-test:${uid}`,
      20,
      "Too many test emails. Please try again in an hour.",
    );
    const status = await sendSystemEmail({
      template: id,
      to: actorEmail,
      uid,
      name: "Robin",
      link: sampleEmailLink(siteUrl(), id),
      test: { content: command.content },
    });
    await db
      .collection(AUDIT)
      .doc(randomUUID())
      .create({
        at: Date.now(),
        actorUid: uid,
        actorEmail,
        action: "email",
        target: id,
        change: { action: "test", status },
      });
    return { status, to: actorEmail };
  }

  return run(uid, actorEmail, command.idempotencyKey, command, async (tx) => {
    const snapshot = await tx.get(ref(id));
    const data = snapshot.data() ?? {};
    const revision = typeof data.revision === "number" ? data.revision : 0;
    if (revision !== command.expectedRevision) throw stale();
    const next = {
      revision: revision + 1,
      updatedAt: Date.now(),
      updatedBy: actorEmail,
    };
    if (command.action === "save") {
      tx.set(ref(id), { ...next, draft: command.content }, { merge: true });
      return {
        audit: { action: "email", target: id, change: { action: "save" } },
        result: { revision: next.revision },
      };
    }
    if (command.action === "discard") {
      tx.set(ref(id), { ...next, draft: null }, { merge: true });
      return {
        audit: { action: "email", target: id, change: { action: "discard" } },
        result: { revision: next.revision },
      };
    }
    if (command.action === "restore") {
      let restored: EmailContent | null = template.defaults;
      if (command.version > 0) {
        const version = await tx.get(
          ref(id).collection("versions").doc(String(command.version)),
        );
        restored = content(version.data()?.content);
        if (!restored)
          throw new GameError("NOT_FOUND", "That version doesn't exist.");
      }
      tx.set(ref(id), { ...next, draft: restored }, { merge: true });
      return {
        audit: {
          action: "email",
          target: id,
          change: { action: "restore", version: command.version },
        },
        result: { revision: next.revision },
      };
    }
    // Publish: the draft becomes the next version, sent from now on.
    const draft = content(data.draft);
    if (!draft)
      throw new GameError(
        "VALIDATION_FAILED",
        "There are no changes to publish.",
      );
    const version =
      (typeof data.published?.version === "number"
        ? data.published.version
        : 0) + 1;
    const published = {
      version,
      content: draft,
      publishedAt: next.updatedAt,
      publishedBy: actorEmail,
    };
    tx.create(ref(id).collection("versions").doc(String(version)), published);
    tx.set(ref(id), { ...next, draft: null, published }, { merge: true });
    return {
      audit: {
        action: "email",
        target: id,
        change: { action: "publish", version },
      },
      result: { revision: next.revision, version },
    };
  });
}
