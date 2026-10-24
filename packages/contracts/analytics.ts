// Site analytics for the admin dashboard, built from data the app already
// keeps: Firebase account metadata and saved playthroughs. Page views live in
// Vercel Web Analytics, which this links to rather than copying.
export const analyticsDays = [30, 90] as const;

export type AnalyticsStory = {
  id: string;
  title: string;
  hidden: boolean;
  // Distinct players with a save for the story, ever.
  players: number;
  // Distinct players who reached an ending.
  finishers: number;
  // finishers / players, 0 to 1; null with no players.
  completionRate: number | null;
  // Distinct players whose save changed in the chosen period.
  activePlayers: number;
  lastPlayedAt: number | null;
};

export type SiteAnalytics = {
  from: string;
  to: string;
  accounts: number;
  // Accounts created in the period.
  signups: number;
  signupsByDay: Array<{ day: string; count: number }>;
  // Accounts that used the app (a signed-in session refreshed) recently.
  active: { day: number; week: number; month: number };
  // Players who saved progress in any story in the period.
  playersInPeriod: number;
  stories: AnalyticsStory[];
  // How much was read, so the page can say when a cap applied.
  savesRead: number;
  savesCapped: boolean;
};
