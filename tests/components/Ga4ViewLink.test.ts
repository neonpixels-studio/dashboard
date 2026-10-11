import { GA4_REPORTS_URL_FIXTURE } from "../support/ga4Links";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { appDetailFixture } from "../support/appDetailFixture";
import Ga4ViewLink from "../../app/components/Ga4ViewLink.vue";

describe("Ga4ViewLink", () => {
  it("renders nothing without detail", () => {
    const wrapper = mount(Ga4ViewLink, { props: { detail: null } });
    expect(wrapper.find("a").exists()).toBe(false);
  });

  it("renders nothing when the detail has no property id", () => {
    const wrapper = mount(Ga4ViewLink, {
      props: { detail: appDetailFixture() },
    });
    expect(wrapper.find("a").exists()).toBe(false);
  });

  it("renders nothing for an invalid property id", () => {
    const wrapper = mount(Ga4ViewLink, {
      props: { detail: appDetailFixture({ ga4PropertyId: "not-a-id" }) },
    });
    expect(wrapper.find("a").exists()).toBe(false);
  });

  it("opens the property's reports in a new tab without leaking the opener", () => {
    const link = mount(Ga4ViewLink, {
      props: { detail: appDetailFixture({ ga4PropertyId: "412345678" }) },
    }).get("a");
    expect(link.attributes("href")).toBe(GA4_REPORTS_URL_FIXTURE);
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener noreferrer");
  });

  it("matches its snapshot", () => {
    expect(
      mount(Ga4ViewLink, {
        props: { detail: appDetailFixture({ ga4PropertyId: "412345678" }) },
      }).html(),
    ).toMatchSnapshot();
  });
});
