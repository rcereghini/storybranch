import type { StoryNode } from "../../../packages/contracts/index";

export function StoryLeafEditor({
  storyId,
  node,
  onChange,
}: {
  storyId: string;
  node: StoryNode;
  onChange: (node: StoryNode) => void;
}) {
  const leaf = node.leaf ?? { version: 1 as const, summary: "", rewards: [] };
  const update = (next: typeof leaf) => onChange({ ...node, leaf: next });
  return (
    <section aria-label="StoryLeaf configuration">
      <h3>StoryLeaf completion</h3>
      <label>
        Completion summary
        <textarea
          aria-label="Completion summary"
          maxLength={1000}
          value={leaf.summary}
          onChange={(e) => update({ ...leaf, summary: e.target.value })}
        />
      </label>
      <p>
        Reward keys belong to this run only. Replay starts a separate run; these
        keys do not grant account access or transfer to other Stories.
      </p>
      {leaf.rewards.map((reward, i) => (
        <div className="studio-output" key={i}>
          <label>
            Reward {i + 1} key
            <input
              aria-label={`Reward ${i + 1} key`}
              value={reward.keyId.slice(storyId.length + 1)}
              onChange={(e) =>
                update({
                  ...leaf,
                  rewards: leaf.rewards.map((r, j) =>
                    j === i
                      ? { ...r, keyId: `${storyId}:${e.target.value}` }
                      : r,
                  ),
                })
              }
            />
          </label>
          <label>
            Reward {i + 1} label
            <input
              aria-label={`Reward ${i + 1} label`}
              maxLength={80}
              value={reward.label}
              onChange={(e) =>
                update({
                  ...leaf,
                  rewards: leaf.rewards.map((r, j) =>
                    j === i ? { ...r, label: e.target.value } : r,
                  ),
                })
              }
            />
          </label>
          <button
            onClick={() =>
              update({
                ...leaf,
                rewards: leaf.rewards.filter((_, j) => i !== j),
              })
            }
          >
            Remove reward {i + 1}
          </button>
        </div>
      ))}
      <button
        disabled={leaf.rewards.length >= 20}
        onClick={() => {
          let n = 1;
          while (leaf.rewards.some((r) => r.keyId === `${storyId}:reward-${n}`))
            n++;
          update({
            ...leaf,
            rewards: [
              ...leaf.rewards,
              { keyId: `${storyId}:reward-${n}`, label: "New reward" },
            ],
          });
        }}
      >
        Add reward key
      </button>
    </section>
  );
}
