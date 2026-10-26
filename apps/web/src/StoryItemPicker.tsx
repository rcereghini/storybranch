import type { Story } from "../../../packages/contracts/index";
import { storyItems, itemLabel } from "../../../packages/domain/story-items";

export function StoryItemPicker({
  story,
  value,
  onChange,
  label,
}: {
  story: Story;
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const items = storyItems(story);
  return (
    <label>
      Existing Story item
      <select
        aria-label={label}
        value={items.some((i) => i.itemId === value) ? value : ""}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      >
        <option value="">Choose an existing item</option>
        {items.map((i) => (
          <option key={i.itemId} value={i.itemId}>
            {itemLabel(story, i.itemId)}
          </option>
        ))}
      </select>
    </label>
  );
}
