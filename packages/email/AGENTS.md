# Email rendering guidance

Before changing system emails, read [the system email contract](../../docs/22-system-emails.md) and [the design system](../../docs/21-design-system.md).

This folder renders structured, plain-text email content into the one fixed branded layout. Keep it portable: no React, Firebase, browser or Node APIs, so the server and the admin preview render identical HTML. Escape everything an editor or AI writes; links come only from the server. Layout or brand changes here change every email at once.
