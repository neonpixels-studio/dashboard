import type { IntegrationProvider } from "../types";
import { mockProvider } from "./mock";

// Adding a real vendor provider is: one file in this directory (implementing
// IntegrationProvider) + one entry in this list. No other file needs to
// change for the orchestrator to pick it up via the registry.
export const PROVIDERS: IntegrationProvider[] = [mockProvider];
