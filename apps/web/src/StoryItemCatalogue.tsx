import { useEffect, useState } from "react";
import {
  itemCatalogueSchema,
  type Story,
} from "../../../packages/contracts/index";
import { itemReferences } from "../../../packages/domain/story-items";

export function StoryItemCatalogue({
  story,
  onChange,
}: {
  story: Story;
  onChange: (story: Story) => void;
}) {
  const [items, setItems] = useState(story.itemCatalogue?.items ?? []);
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const source = JSON.stringify(story.itemCatalogue);
  useEffect(() => {
    setItems(story.itemCatalogue?.items ?? []);
  }, [source, story.id]);
  const refs = itemReferences(story);
  const parsed = itemCatalogueSchema.safeParse({ version: 1, items });
  const local = items.every((i) => i.itemId.startsWith(story.id + ":"));
  const valid = parsed.success && local;
  const add = (itemId: string) => {
    if (
      items.length >= 100 ||
      items.some((i) => i.itemId === itemId) ||
      !itemId.startsWith(story.id + ":") ||
      !/^[a-z0-9-]+:[a-z0-9-]+$/.test(itemId) ||
      itemId.length > 100
    ) {
      setMessage(
        "Choose a unique local item ID; the catalogue holds up to 100 items.",
      );
      return;
    }
    setItems([
      ...items,
      { itemId, name: itemId.slice(story.id.length + 1), description: "" },
    ]);
    setSlug("");
    setMessage("");
  };
  const uncatalogued = [...new Set(refs.map((r) => r.itemId))].filter(
    (id) => !items.some((i) => i.itemId === id),
  );
  return (
    <section aria-label="Story item catalogue" className="story-item-catalogue">
      <h3>Story items</h3>
      <p>
        Names and descriptions only. IDs stay fixed; quantities belong to each
        playthrough. Apply to update the draft catalogue.
      </p>
      {items.map((item, i) => (
        <fieldset key={item.itemId}>
          <legend>{item.itemId}</legend>
          <label>
            Name
            <input
              aria-label={`Item ${item.itemId} name`}
              value={item.name}
              maxLength={80}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    i === j ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            Description
            <textarea
              aria-label={`Item ${item.itemId} description`}
              value={item.description}
              maxLength={500}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    i === j ? { ...x, description: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <details>
            <summary>
              Where used ({refs.filter((r) => r.itemId === item.itemId).length})
            </summary>
            <ul>
              {refs
                .filter((r) => r.itemId === item.itemId)
                .map((r) => (
                  <li key={r.storyNodeId + r.path}>{r.location}</li>
                ))}
            </ul>
          </details>
          {refs.some((r) => r.itemId === item.itemId) && (
            <p>
              Remove references before removing this catalogue entry. Existing
              inventory and published editions are preserved.
            </p>
          )}
          <button
            className="btn btn-secondary"
            disabled={refs.some((r) => r.itemId === item.itemId)}
            onClick={() => setItems(items.filter((_, j) => j !== i))}
          >
            Remove {item.itemId}
          </button>
        </fieldset>
      ))}
      <label>
        New item ID suffix
        <input
          aria-label="New item ID suffix"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="brass-key"
        />
      </label>
      <button
        className="btn btn-secondary"
        disabled={items.length >= 100}
        onClick={() => add(`${story.id}:${slug}`)}
      >
        Add catalogue item
      </button>
      {uncatalogued.length > 0 && (
        <div>
          <h4>Uncatalogued references</h4>
          {uncatalogued.map((id) => (
            <button
              key={id}
              className="btn btn-secondary"
              onClick={() => add(id)}
            >
              Describe {id}
            </button>
          ))}
        </div>
      )}
      <button
        className="btn btn-primary"
        disabled={!valid}
        onClick={() => {
          if (parsed.success && local) {
            onChange({ ...story, itemCatalogue: parsed.data });
            setMessage("Catalogue applied to the draft.");
          }
        }}
      >
        Apply catalogue
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => {
          setItems(story.itemCatalogue?.items ?? []);
          setMessage("Catalogue edits reset.");
        }}
      >
        Reset catalogue
      </button>
      <p role="status" className="key-history-status">
        {valid
          ? message
          : "Use unique local IDs, nonempty names up to 80 characters and descriptions up to 500 characters."}
      </p>
    </section>
  );
}
