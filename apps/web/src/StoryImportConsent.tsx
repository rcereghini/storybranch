import { useEffect, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type { SourceRunSelection } from "../../../packages/contracts/index";
import type {
  StoryImportOffer,
  StorySourceRuns,
} from "../../../packages/contracts/key-imports";
type Api = ReturnType<typeof createApi>;
type ImportKey = StoryImportOffer["keys"][number];

function SourceJourneyPicker({
  api,
  offer,
  sourceRunsEndpoint,
  source,
  required,
  selected,
  onChange,
}: {
  api: Api;
  offer: StoryImportOffer;
  sourceRunsEndpoint?: string;
  source: ImportKey;
  required: boolean;
  selected: string;
  onChange: (runId: string) => void;
}) {
  const [items, setItems] = useState<StorySourceRuns["items"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const endpoint =
    (sourceRunsEndpoint
      ? `${sourceRunsEndpoint}&`
      : `/story-imports/${offer.storyId}/${offer.versionId}/runs?`) +
    `keyId=${encodeURIComponent(source.keyId)}`;
  const request = (cursor?: string) =>
    api<StorySourceRuns>(
      endpoint + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""),
    );
  const accept = (data: StorySourceRuns, append: boolean) => {
    setItems((old) =>
      append
        ? [
            ...new Map(
              [...old, ...data.items].map((r) => [r.runId, r]),
            ).values(),
          ]
        : data.items,
    );
    setCursor(data.nextCursor);
  };
  useEffect(() => {
    let cancelled = false;
    request()
      .then((data) => {
        if (!cancelled) accept(data, false);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your journeys. Try again.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);
  const load = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      accept(await request(cursor ?? undefined), !!cursor);
    } catch {
      setError("Could not load your journeys. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset>
      <legend>
        {source.sourceTitle} · {source.sourceVersionId}
      </legend>
      <label>
        Completed journey{required ? " (required)" : " (optional)"}
        <select
          aria-label={`Source journey for ${source.sourceTitle}`}
          value={selected}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {busy && !items.length
              ? "Loading journeys…"
              : required
                ? "Choose a completed journey"
                : "Do not import a journey"}
          </option>
          {items.map((r) => (
            <option key={r.runId} value={r.runId}>
              {r.endingTitle} · {new Date(r.completedAt).toLocaleString()} ·{" "}
              {r.runId.slice(-6)}
            </option>
          ))}
        </select>
      </label>
      <div className="source-journey-status" aria-live="polite">
        {error ||
          (!busy && !items.length
            ? "No eligible journeys in this batch."
            : "Only this edition's completed journeys are listed.")}
      </div>
      {(cursor || error) && (
        <button disabled={busy} onClick={() => void load()}>
          {error ? "Retry loading journeys" : "Load more journeys"}
        </button>
      )}
    </fieldset>
  );
}

export function StoryImportConsent({
  api,
  offer,
  sourceRunsEndpoint,
  disabled,
  onCancel,
  onStart,
}: {
  api: Api;
  offer: StoryImportOffer;
  sourceRunsEndpoint?: string;
  disabled: boolean;
  onCancel: () => void;
  onStart: (consent: boolean, selections: SourceRunSelection[]) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const groups = new Map<string, { source: ImportKey; required: boolean }>();
  for (const key of offer.keys.filter((k) => k.selection === "completed-run")) {
    const identity = `${key.sourceStoryId}/${key.sourceVersionId}`;
    groups.set(identity, {
      source: key,
      required: key.required || !!groups.get(identity)?.required,
    });
  }
  const missing = [...groups].some(
    ([identity, group]) => group.required && !selected[identity],
  );
  const confirm = () =>
    onStart(
      true,
      [...groups].flatMap(([identity, { source }]) =>
        selected[identity]
          ? [
              {
                sourceStoryId: source.sourceStoryId!,
                sourceVersionId: source.sourceVersionId!,
                runId: selected[identity],
              },
            ]
          : [],
      ),
    );
  return (
    <div className="modal-backdrop">
      <section
        className="modal key-import-consent"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <button
          autoFocus
          className="modal-close"
          aria-label="Cancel key imports"
          onClick={onCancel}
        >
          ×
        </button>
        <h2 id="import-title">
          {groups.size
            ? "Choose your story history"
            : "Bring your earned keys?"}
        </h2>
        <p>
          {offer.title} can check the following keys from other Stories by this
          creator. Your approval and any selected journeys apply only to this
          new playthrough.
        </p>
        <ul>
          {offer.keys.map((k) => (
            <li key={k.keyId}>
              {k.label} — {k.sourceTitle} (
              {k.selection === "completed-run"
                ? "selected journey"
                : "ever earned"}
              {k.required ? ", required" : ", optional"})
            </li>
          ))}
        </ul>
        {[...groups].map(([identity, group]) => (
          <SourceJourneyPicker
            key={identity}
            api={api}
            offer={offer}
            sourceRunsEndpoint={sourceRunsEndpoint}
            source={group.source}
            required={group.required}
            selected={selected[identity] ?? ""}
            onChange={(runId) =>
              setSelected((old) => ({ ...old, [identity]: runId }))
            }
          />
        ))}
        <p>
          Only the declared keys are checked. Your other choices and inventory
          stay private. The results stay fixed for this journey.
        </p>
        <button
          className="btn btn-primary"
          disabled={disabled || missing}
          onClick={confirm}
        >
          {groups.size ? "Use selected journeys" : "Use earned keys"}
        </button>
        {!offer.keys.some((k) => k.required) && (
          <button
            className="btn btn-secondary"
            disabled={disabled}
            onClick={() => onStart(false, [])}
          >
            Start without imported keys
          </button>
        )}
      </section>
    </div>
  );
}
