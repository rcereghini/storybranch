import { useEffect, useRef, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type {
  InvitationListing,
  StoryEntry,
} from "../../../packages/contracts/invitations";
type Api = ReturnType<typeof createApi>;

export function StoryInvitations({
  api,
  storyId,
  notify,
}: {
  api: Api;
  storyId: string;
  notify: (text: string) => void;
}) {
  const [data, setData] = useState<InvitationListing | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [maxClaims, setMaxClaims] = useState(1);
  const [days, setDays] = useState(7);
  const pending = useRef<object | null>(null);
  const load = async (cursor?: string) => {
    const result = await api<InvitationListing>(
      `/story-invitations/${storyId}${cursor ? `?cursor=${cursor}` : ""}`,
    );
    setData((old) =>
      cursor && old
        ? { ...result, items: [...old.items, ...result.items] }
        : result,
    );
  };
  useEffect(() => {
    let cancelled = false;
    api<InvitationListing>(`/story-invitations/${storyId}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) notify(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, storyId]);
  const submit = async (input: object) => {
    pending.current ??= { ...input, idempotencyKey: crypto.randomUUID() };
    setBusy(true);
    try {
      const result = await api<{ code?: string }>(
        `/story-invitations/${storyId}`,
        pending.current,
      );
      if (result.code) setCode(result.code);
      pending.current = null;
      await load();
      notify("Invitation settings saved.");
    } catch (e) {
      notify(
        (e as Error).message + " Retry this change or reload invitations.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Story invitations">
      <h3>Story invitations</h3>
      <p>
        Control who can start new journeys. Existing journeys and shared media
        stay accessible. Redeemed entry keys are permanent.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          pending.current = null;
          setBusy(true);
          try {
            await load();
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Reload invitations
      </button>
      {busy && (
        <div className="loading-overlay" role="status">
          Saving invitations…
        </div>
      )}
      {!data && (
        <div
          className="placeholder-block"
          style={{ minHeight: 200 }}
          aria-hidden="true"
        />
      )}
      {data && (
        <>
          <p>
            New journeys:{" "}
            {data.policy.invitationRequired
              ? "Invitation required"
              : "Open to everyone"}
          </p>
          {!data.published && (
            <p>
              Save your entry policy now; publish the Story before creating
              invitation codes.
            </p>
          )}
          <button
            disabled={busy || !!pending.current}
            onClick={() =>
              void submit({
                action: "policy",
                expectedRevision: data.policy.revision,
                invitationRequired: !data.policy.invitationRequired,
              })
            }
          >
            {data.policy.invitationRequired
              ? "Allow everyone to start"
              : "Require invitation to start"}
          </button>
          <label>
            Redemption slots
            <input
              aria-label="Invitation redemption slots"
              type="number"
              min={1}
              max={1000}
              value={maxClaims}
              onChange={(e) => setMaxClaims(Number(e.target.value))}
            />
          </label>
          <label>
            Days to redeem
            <input
              aria-label="Invitation days to redeem"
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <button
            disabled={
              busy ||
              !data.published ||
              !!pending.current ||
              !Number.isInteger(maxClaims) ||
              maxClaims < 1 ||
              maxClaims > 1000 ||
              !Number.isInteger(days) ||
              days < 1 ||
              days > 30
            }
            onClick={() => void submit({ action: "create", maxClaims, days })}
          >
            Create invitation code
          </button>
          {code && (
            <label>
              Copy this code to share privately. It is not shown again after
              leaving.
              <textarea
                aria-label="New invitation code"
                readOnly
                value={code}
                rows={2}
              />
            </label>
          )}
          {pending.current && (
            <button disabled={busy} onClick={() => void submit({})}>
              Retry invitation change
            </button>
          )}
          <ul>
            {data.items.map((item) => (
              <li key={item.id}>
                <p>
                  {item.claims} of {item.maxClaims} redeemed · Redeem by{" "}
                  {new Date(item.expiresAt).toLocaleDateString()} ·{" "}
                  {item.disabled
                    ? "Disabled"
                    : item.expiresAt <= Date.now()
                      ? "Expired"
                      : item.claims >= item.maxClaims
                        ? "Fully redeemed"
                        : "Active"}
                </p>
                <button
                  disabled={busy || !!pending.current || item.disabled}
                  onClick={() =>
                    void submit({
                      action: "disable",
                      invitationId: item.id,
                      expectedRevision: item.revision,
                    })
                  }
                >
                  Disable invitation {item.id.slice(0, 8)}
                </button>
              </li>
            ))}
          </ul>
          {data.nextCursor && (
            <button
              disabled={busy || !!pending.current}
              onClick={async () => {
                setBusy(true);
                try {
                  await load(data.nextCursor!);
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              More invitations
            </button>
          )}
        </>
      )}
    </section>
  );
}

export function StoryEntryKey({
  api,
  storyId,
  signedIn,
  onSignIn,
  notify,
}: {
  api: Api;
  storyId: string;
  signedIn: boolean;
  onSignIn: () => void;
  notify: (text: string) => void;
}) {
  const [entry, setEntry] = useState<StoryEntry | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ idempotencyKey: string; code: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (signedIn)
      api<StoryEntry>(`/story-entry/${storyId}`)
        .then((e) => {
          // A load begun before redemption must not overwrite the permanent grant.
          if (!cancelled)
            setEntry((current) => (current?.hasKey ? current : e));
        })
        .catch((e) => {
          if (!cancelled) notify(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [api, storyId, signedIn]);
  return (
    <section className="panel" aria-label="Story entry key">
      <h2>Story invitation</h2>
      <p>
        {entry?.hasKey
          ? "Your permanent entry key is saved. You can start this Story."
          : entry?.invitationRequired
            ? entry.canStart
              ? "As the creator, you can start this Story."
              : "An invitation is required to start a new journey."
            : "Have an invitation from the creator? Redeem it here."}
      </p>
      {!signedIn ? (
        <button onClick={onSignIn}>Sign in to redeem</button>
      ) : (
        !entry?.hasKey && (
          <>
            <label className="email-field">
              Invitation code
              <input
                aria-label="Invitation code"
                autoComplete="off"
                value={code}
                disabled={busy}
                onChange={(e) => {
                  setCode(e.target.value);
                  pending.current = null;
                }}
              />
            </label>
            <button
              disabled={busy || !/^[a-f0-9]{48}$/.test(code.trim())}
              onClick={async () => {
                pending.current ??= {
                  idempotencyKey: crypto.randomUUID(),
                  code: code.trim(),
                };
                setBusy(true);
                try {
                  await api(`/story-entry/${storyId}`, pending.current);
                  pending.current = null;
                  setCode("");
                  setEntry({
                    invitationRequired: entry?.invitationRequired ?? false,
                    hasKey: true,
                    canStart: true,
                  });
                  notify("");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Redeem invitation
            </button>
          </>
        )
      )}
      {busy && (
        <div className="loading-overlay" role="status">
          Redeeming invitation…
        </div>
      )}
    </section>
  );
}
