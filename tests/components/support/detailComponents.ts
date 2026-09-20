// AppDetailMarketing/Product/Writing and TrafficPanel all rely on Nuxt's
// component auto-import at runtime, so tests must register the sub-components
// they render by hand (see PropertyCard.test.ts). The four "detail" suites
// need overlapping subsets of the same set — registering the full union here
// keeps each suite's mount helper a one-liner instead of repeating the same
// import/register block four times.
import MetricTile from "../../../app/components/MetricTile.vue";
import AppIcon from "../../../app/components/AppIcon.vue";
import SectionLabel from "../../../app/components/SectionLabel.vue";
import SparkLine from "../../../app/components/SparkLine.vue";
import AxisRow from "../../../app/components/AxisRow.vue";
import BarMeter from "../../../app/components/BarMeter.vue";
import StatList from "../../../app/components/StatList.vue";
import TrafficPanel from "../../../app/components/TrafficPanel.vue";
import SourcesFooter from "../../../app/components/SourcesFooter.vue";
import SyndicationPostMatrix from "../../../app/components/SyndicationPostMatrix.vue";

export const DETAIL_COMPONENTS = {
  MetricTile,
  AppIcon,
  SectionLabel,
  SparkLine,
  AxisRow,
  BarMeter,
  StatList,
  TrafficPanel,
  SourcesFooter,
  SyndicationPostMatrix,
};
