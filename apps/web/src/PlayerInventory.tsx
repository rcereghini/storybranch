import { useEffect, useRef, useState } from "react";
import type { PlayerItem } from "../../../packages/contracts/player";
import { usePlayerContext } from "./Story";

/** Read-only run projection. The native modal keeps focus and overlays playback. */
export function PlayerInventory({ inventory }: { inventory?: PlayerItem[] }) {
  const save = usePlayerContext();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items =
    inventory ??
    Object.entries(save.items)
      .filter(([, quantity]) => quantity > 0)
      .map(([itemId, quantity]) => ({
        itemId,
        name: itemId,
        description: "",
        quantity,
      }));
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      <button ref={trigger} onClick={() => setOpen(true)}>
        Inventory
      </button>
      <dialog
        ref={dialog}
        className="player-inventory"
        aria-labelledby="inventory-title"
        onKeyDown={(event) => {
          // Close is the drawer's only interactive control. Keep Tab in it.
          if (event.key === "Tab") {
            event.preventDefault();
            dialog.current?.querySelector("button")?.focus();
          }
        }}
        onCancel={() => setOpen(false)}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <div className="section-heading">
          <h2 id="inventory-title">Your inventory</h2>
          <button
            autoFocus
            onClick={() => setOpen(false)}
            aria-label="Close inventory"
          >
            Close
          </button>
        </div>
        <p>Items in this journey</p>
        {items.length === 0 ? (
          <p>You haven't collected any items yet.</p>
        ) : (
          <ul aria-label="Owned items">
            {items.map((item) => (
              <li key={item.itemId}>
                <div className="inventory-item-heading">
                  <strong>{item.name}</strong>
                  <span aria-label={`Quantity ${item.quantity}`}>
                    × {item.quantity}
                  </span>
                </div>
                {item.description && <p>{item.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}
