export type OpeningBranch = 'A' | 'B' | 'C';
export type OpeningEntry = 'move' | 'hunt' | 'continue';
export type OpeningPage = { title: string; text: string };
export type OpeningChoice = {
  code: OpeningBranch;
  label: string;
  pages: OpeningPage[];
  quest: string;
  task: string;
  farewell: string;
  rewardCode: string;
  rewardName: string;
  rewardUse: string;
  future: string;
  pack?: string;
};
export type OpeningRoute = {
  code: string;
  version: number;
  title: string;
  region: string;
  destination: string;
  moveEntry: string;
  huntEntry: string;
  pages: OpeningPage[];
  choices: OpeningChoice[];
  arrival: OpeningPage[];
};
export type OpeningState = 'armed' | 'reading' | 'choice' | 'branch' | 'arrival' | 'lesson' | 'completed';
export type OpeningView = {
  route: string; title: string; state: OpeningState; revision: number;
  text: string; page: number; pages: number; branch: OpeningBranch | null;
  choices: { code: string; label: string }[]; action?: string;
  reward?: string; destination?: string; worldChanged?: boolean;
};
