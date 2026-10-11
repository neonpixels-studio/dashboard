// AppDetailMarketing/Product/Writing and TrafficPanel all rely on Nuxt's
// component auto-import at runtime, so tests must register the sub-components
// they render by hand (see PropertyCard.test.ts). The four "detail" suites
// need overlapping subsets of the same set — registering the full union here
// keeps each suite's mount helper a one-liner instead of repeating the same
// import/register block four times.
import MetricTile from "../../../app/components/MetricTile.vue";
import MetricTileSkeleton from "../../../app/components/MetricTileSkeleton.vue";
import MetricTileGrid from "../../../app/components/MetricTileGrid.vue";
import SkeletonBlock from "../../../app/components/SkeletonBlock.vue";
import DataErrorState from "../../../app/components/DataErrorState.vue";
import DetailStateShell from "../../../app/components/DetailStateShell.vue";
import AppAlert from "../../../app/components/AppAlert.vue";
import AppIcon from "../../../app/components/AppIcon.vue";
import SectionLabel from "../../../app/components/SectionLabel.vue";
import Ga4ViewLink from "../../../app/components/Ga4ViewLink.vue";
import SparkLine from "../../../app/components/SparkLine.vue";
import AxisRow from "../../../app/components/AxisRow.vue";
import BarMeter from "../../../app/components/BarMeter.vue";
import StatList from "../../../app/components/StatList.vue";
import TrafficPanel from "../../../app/components/TrafficPanel.vue";
import SourcesFooter from "../../../app/components/SourcesFooter.vue";
import SyndicationPostMatrix from "../../../app/components/SyndicationPostMatrix.vue";
import PropertySessionsChart from "../../../app/components/PropertySessionsChart.vue";
import AppDetailProductMoneyHealthPanel from "../../../app/components/AppDetailProductMoneyHealthPanel.vue";
import AppDetailProductSentryPanel from "../../../app/components/AppDetailProductSentryPanel.vue";
import SentryEventsTrend from "../../../app/components/SentryEventsTrend.vue";
import SentryIssueList from "../../../app/components/SentryIssueList.vue";
import SentryIssuesPanel from "../../../app/components/SentryIssuesPanel.vue";
import AppDetailProductAuthPanel from "../../../app/components/AppDetailProductAuthPanel.vue";
import PanelHead from "../../../app/components/PanelHead.vue";
import AuthSignupsCard from "../../../app/components/AuthSignupsCard.vue";
import AuthMethodsCard from "../../../app/components/AuthMethodsCard.vue";

export const DETAIL_COMPONENTS = {
  MetricTile,
  MetricTileSkeleton,
  MetricTileGrid,
  SkeletonBlock,
  DataErrorState,
  DetailStateShell,
  AppAlert,
  AppIcon,
  SectionLabel,
  Ga4ViewLink,
  SparkLine,
  AxisRow,
  BarMeter,
  StatList,
  TrafficPanel,
  SourcesFooter,
  SyndicationPostMatrix,
  PropertySessionsChart,
  AppDetailProductMoneyHealthPanel,
  AppDetailProductSentryPanel,
  SentryIssuesPanel,
  SentryEventsTrend,
  SentryIssueList,
  AppDetailProductAuthPanel,
  PanelHead,
  AuthSignupsCard,
  AuthMethodsCard,
};
