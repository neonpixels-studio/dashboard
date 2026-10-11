import { getQuery } from "h3";
import type { H3Event } from "h3";
import {
  parseOverviewRange,
  type OverviewRangeDays,
} from "../../shared/constants/overviewRange";

// Isolated from the handler so the only place a raw query value is read is
// right next to its validation — everything downstream gets a narrowed
// 7 | 30 | 60.
export function readOverviewRange(event: H3Event): OverviewRangeDays {
  return parseOverviewRange(getQuery(event).range);
}
