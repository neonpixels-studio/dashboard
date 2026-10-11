// The slice of a Netlify deploy the dashboard keeps.
export interface NetlifyDeploy {
  id: string;
  // Netlify's raw state string (ready, error, building, ...).
  state: string;
  // Null while the deploy is still in progress.
  finishedAt: Date | null;
}

// Resolves a Netlify project name (basin-fm) to its latest production deploy,
// or null when the project has never had one. The real implementation is
// netlifyClient.ts; tests pass a fake.
export type FetchLatestProductionDeploy = (
  projectName: string,
) => Promise<NetlifyDeploy | null>;
