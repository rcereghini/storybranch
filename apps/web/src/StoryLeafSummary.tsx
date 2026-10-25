import type { StoryCompletion } from "../../../packages/contracts/index";

export function StoryLeafSummary({
  completion,
}: {
  completion: StoryCompletion;
}) {
  if (
    !completion.summary &&
    !completion.rewards.length &&
    !completion.storyKeys?.length &&
    !completion.accountAchievement
  )
    return null;
  return (
    <section className="story-leaf-summary" aria-label="StoryLeaf completion">
      <h2>
        {completion.rewards.length
          ? "Your journey’s rewards"
          : "Journey complete"}
      </h2>
      {completion.summary && <p>{completion.summary}</p>}
      {!!completion.storyKeys?.length && (
        <section aria-label="Persistent keys earned">
          <h3>Unlocked for your next journey</h3>
          <ul>
            {completion.storyKeys.map((key) => (
              <li key={key.keyId}>{key.label}</li>
            ))}
          </ul>
          <p>These keys carry into your next run of this Story.</p>
        </section>
      )}
      {completion.accountAchievement && (
        <p>
          <strong>
            Account achievement: {completion.accountAchievement.title}
          </strong>{" "}
          —{" "}
          {completion.accountAchievement.newlyGranted
            ? "Earned"
            : "Already earned"}
        </p>
      )}
      {completion.rewards.length > 0 && (
        <>
          <ul>
            {completion.rewards.map((reward) => (
              <li key={reward.keyId}>
                <strong>{reward.label}</strong> —{" "}
                {reward.newlyGranted ? "Earned" : "Already held"}
              </li>
            ))}
          </ul>
          <p>Saved to this journey. These keys stay in this Story run.</p>
        </>
      )}
    </section>
  );
}
