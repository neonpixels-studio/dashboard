import type { IntegrationProvider } from "../types";
import { mockProvider } from "./mock";
import { stripeProvider } from "../stripe";
import { ga4Provider } from "../ga4";
import { sentryProvider } from "../sentry";
import { clerkProvider } from "../clerk";

// Adding a real vendor provider is: one file (or, once a vendor needs more
// than one file, a directory — see ../stripe) implementing IntegrationProvider
// + one entry in this list. No other file needs to change for the
// orchestrator to pick it up via the registry.
export const PROVIDERS: IntegrationProvider[] = [
  mockProvider,
  stripeProvider,
  ga4Provider,
  sentryProvider,
  clerkProvider,
];
