import { useEffect, useRef, useState } from "react";
import { ApiError, type createApi } from "../../../packages/api-client/index";
import type { Story } from "../../../packages/contracts/index";
import type {
  PromotionalDefinition,
  PromotionalGrant,
  PromotionalListing,
} from "../../../packages/contracts/promotional-keys";
type Api = ReturnType<typeof createApi>;

// Mount by actor/Story identity; failed batches retain their cursor and items.
function usePromotions<T>(
  api: Api,
  path: string,
  identity: (item: T) => string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<object | null>(null);
  const mount = useRef(0);
  const locked = useRef(false);
  const load = async (after?: string) => {
    const scope = mount.current;
    setBusy(true);
    try {
      const result = await api<PromotionalListing<T>>(
        path + (after ? `?cursor=${encodeURIComponent(after)}` : ""),
      );
      if (scope !== mount.current) return;
      setItems((old) =>
        after
          ? [
              ...new Map(
                [...old, ...result.items].map((i) => [identity(i), i]),
              ).values(),
            ]
          : result.items,
      );
      setCursor(result.nextCursor);
      setMessage(
        result.items.length || after
          ? "Keys loaded. Status is checked again when you use a key."
          : "No promotional keys yet.",
      );
    } catch (e) {
      if (scope === mount.current)
        setMessage((e as Error).message + " Use Reload keys to try again.");
    } finally {
      if (scope === mount.current) setBusy(false);
    }
  };
  useEffect(() => {
    mount.current++;
    void load();
    return () => {
      mount.current++;
    };
  }, [api, path]);
  const submit = async (
    input: object,
    done?: (result: { code?: string }) => void,
  ) => {
    if (locked.current) return;
    locked.current = true;
    const scope = mount.current;
    const command = pending ?? {
      ...input,
      idempotencyKey: crypto.randomUUID(),
    };
    setPending(command);
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ code?: string }>(path, command);
      if (scope !== mount.current) return;
      setPending(null);
      done?.(result);
      await load();
    } catch (e) {
      if (scope !== mount.current) return;
      if (e instanceof ApiError && e.code !== "UNAVAILABLE") setPending(null);
      setMessage(
        (e as Error).message +
          " Retry an uncertain request with Retry change; reload keys after a conflict.",
      );
    } finally {
      locked.current = false;
      if (scope === mount.current) setBusy(false);
    }
  };
  return { items, cursor, busy, message, pending, load, submit };
}

export function PromotionalKeyEditor({
  api,
  story,
  onChange,
}: {
  api: Api;
  story: Story;
  onChange: (story: Story) => void;
}) {
  const list = usePromotions<PromotionalDefinition>(
    api,
    "/promotional-keys",
    (k) => k.id,
  );
  const [label, setLabel] = useState("Bonus access");
  const [stories, setStories] = useState(story.id);
  const [days, setDays] = useState(30);
  const [redemptionDays, setRedemptionDays] = useState(7);
  const [maxClaims, setMaxClaims] = useState(10);
  const [code, setCode] = useState("");
  const bindings = story.accountKeys?.keys ?? [];
  const done = (r: { code?: string }) => {
    if (r.code) setCode(r.code);
  };
  return (
    <section className="promotional-keys" aria-label="Promotional key settings">
      <h3>Promotional keys</h3>
      <p>
        Temporary account keys for options in your listed Stories. Save each
        Story first. These do not protect downloaded media or grant paid access.
      </p>
      <fieldset disabled={list.busy || !!list.pending}>
        <legend>Issue a promotional key</legend>
        <label>
          Key label
          <input
            aria-label="Promotional key label"
            maxLength={80}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          Allowed Story IDs, separated by commas
          <input
            aria-label="Promotional key Stories"
            value={stories}
            onChange={(e) => setStories(e.target.value)}
          />
        </label>
        <label>
          Key expires in days from creation
          <input
            aria-label="Promotional key days"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <label>
          Code can be redeemed for days
          <input
            aria-label="Promotional redemption days"
            type="number"
            min={1}
            max={30}
            value={redemptionDays}
            onChange={(e) => setRedemptionDays(Number(e.target.value))}
          />
        </label>
        <label>
          Maximum recipients
          <input
            aria-label="Promotional maximum recipients"
            type="number"
            min={1}
            max={1000}
            value={maxClaims}
            onChange={(e) => setMaxClaims(Number(e.target.value))}
          />
        </label>
        <button
          className="btn btn-secondary"
          onClick={() =>
            void list.submit(
              {
                action: "create",
                definitionId: crypto.randomUUID(),
                label,
                storyIds: stories
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                days,
                redemptionDays,
                maxClaims,
              },
              done,
            )
          }
        >
          Create promotional code
        </button>
      </fieldset>
      {code && (
        <label>
          Copy this code and share it with recipients
          <input aria-label="New promotional code" readOnly value={code} />
        </label>
      )}
      <p className="key-history-status" role="status">
        {list.busy ? "Loading or saving promotional keys…" : list.message}
      </p>
      {list.pending && (
        <button
          className="btn btn-secondary"
          disabled={list.busy}
          onClick={() => void list.submit({}, done)}
        >
          Retry change
        </button>
      )}
      <button
        className="btn btn-secondary"
        disabled={list.busy || !!list.pending}
        onClick={() => void list.load()}
      >
        Reload keys
      </button>
      <ul className="earned-key-list">
        {list.items.map((key) => (
          <li key={key.id}>
            <strong>{key.label}</strong>
            <p>
              {key.revoked
                ? "Revoked"
                : key.expiresAt <= Date.now()
                  ? "Expired"
                  : "Active"}{" "}
              · Key expires {new Date(key.expiresAt).toLocaleString()}
            </p>
            <p>
              {key.claims}/{key.maxClaims} recipients · Redeem by{" "}
              {new Date(key.redeemBy).toLocaleString()}
            </p>
            <p>Allowed Stories: {key.storyIds.join(", ")}</p>
            <button
              className="btn btn-secondary"
              disabled={
                list.busy ||
                !!list.pending ||
                key.revoked ||
                key.expiresAt <= Date.now() ||
                !key.storyIds.includes(story.id) ||
                bindings.length >= 20 ||
                bindings.some(
                  (k) =>
                    k.source !== "achievement" && k.definitionId === key.id,
                )
              }
              onClick={() => {
                let suffix = 1;
                while (
                  bindings.some(
                    (k) => k.keyId === `${story.id}:promo-${suffix}`,
                  )
                )
                  suffix++;
                onChange({
                  ...story,
                  accountKeys: {
                    version: 1,
                    keys: [
                      ...bindings,
                      {
                        keyId: `${story.id}:promo-${suffix}`,
                        label: key.label,
                        definitionId: key.id,
                      },
                    ],
                  },
                });
              }}
            >
              Use in this Story
            </button>
            <button
              className="btn btn-secondary"
              disabled={list.busy || !!list.pending || key.revoked}
              onClick={() =>
                void list.submit(
                  {
                    action: "revoke",
                    definitionId: key.id,
                    expectedRevision: key.revision,
                  },
                  done,
                )
              }
            >
              Revoke promotional key
            </button>
          </li>
        ))}
      </ul>
      {list.cursor && (
        <button
          className="btn btn-secondary"
          disabled={list.busy || !!list.pending}
          onClick={() => void list.load(list.cursor!)}
        >
          More promotional keys
        </button>
      )}
      <h4>Aliases in this Story</h4>
      {bindings
        .filter((key) => key.source !== "achievement")
        .map((key, i) => (
          <p key={key.keyId}>
            {key.label} · {key.keyId}{" "}
            <button
              className="btn btn-secondary"
              onClick={() =>
                onChange({
                  ...story,
                  accountKeys: {
                    version: 1,
                    keys: bindings.filter((k) => k.keyId !== key.keyId),
                  },
                })
              }
            >
              Remove promotional alias {i + 1}
            </button>
          </p>
        ))}
      <p>
        Consumer Stories and expiry are fixed when issued. Revoke stops future
        gated choices for every recipient; it cannot undo committed choices.
        Publish a new edition to apply alias changes.
      </p>
    </section>
  );
}

export function PromotionalKeyWallet({ api }: { api: Api }) {
  const list = usePromotions<PromotionalGrant>(
    api,
    "/promotional-key-grants",
    (k) => k.definitionId,
  );
  const [code, setCode] = useState("");
  return (
    <section
      className="panel story-key-history promotional-keys"
      aria-label="My promotional keys"
    >
      <h2>Promotional keys</h2>
      <p>
        Redeem a creator’s code to unlock eligible options in their Stories.
        These keys can expire or be revoked.
      </p>
      <label className="field">
        <span>Promotional code</span>
        <input
          aria-label="Promotional code"
          autoComplete="off"
          value={code}
          disabled={list.busy || !!list.pending}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <button
        className="btn btn-secondary"
        disabled={list.busy || (!code.trim() && !list.pending)}
        onClick={() => void list.submit({ code }, () => setCode(""))}
      >
        {list.pending ? "Retry redemption" : "Redeem promotional code"}
      </button>
      <p className="key-history-status" role="status">
        {list.busy ? "Loading or redeeming promotional keys…" : list.message}
      </p>
      <button
        className="btn btn-secondary"
        disabled={list.busy || !!list.pending}
        onClick={() => void list.load()}
      >
        Reload keys
      </button>
      <ul className="earned-key-list">
        {list.items.map((key) => (
          <li key={key.definitionId}>
            <strong>{key.label}</strong>
            <p>Status: {key.status}</p>
            <p>
              Redeemed {new Date(key.grantedAt).toLocaleDateString()}
              {key.expiresAt
                ? ` · Expires ${new Date(key.expiresAt).toLocaleString()}`
                : ""}
            </p>
          </li>
        ))}
      </ul>
      {list.cursor && (
        <button
          className="btn btn-secondary"
          disabled={list.busy || !!list.pending}
          onClick={() => void list.load(list.cursor!)}
        >
          More promotional keys
        </button>
      )}
    </section>
  );
}
