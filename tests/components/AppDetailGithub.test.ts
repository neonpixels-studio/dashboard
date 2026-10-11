import { describe, expect, it } from "vitest";
import AppDetailMarketing from "../../app/components/AppDetailMarketing.vue";
import AppDetailProduct from "../../app/components/AppDetailProduct.vue";
import AppDetailWriting from "../../app/components/AppDetailWriting.vue";
import GithubSection from "../../app/components/GithubSection.vue";
import { findAppBySlug } from "../../app/config/apps";
import { toAppDetailViewModel } from "../../app/utils/appViewModel";
import { mountDetailTemplate } from "./support/mountDetailTemplate";
import { appDetailFixture } from "../support/appDetailFixture";

const GITHUB = {
  configured: true,
  repos: [
    {
      repo: "grimicorn",
      synced: true,
      openIssues: 5,
      openPrs: 2,
      ciState: "failing" as const,
      ciUrl: "https://github.com/neonpixels-studio/grimicorn/commit/abc/checks",
      repoUrl: "https://github.com/neonpixels-studio/grimicorn",
    },
  ],
  issuesUrl: "https://github.com/neonpixels-studio/grimicorn/issues",
  pullsUrl: "https://github.com/neonpixels-studio/grimicorn/pulls",
  items: [],
};

// The issue requires the GitHub section on all six detail pages, which come
// from these three templates.
describe.each([
  ["product", AppDetailProduct, "basin"],
  ["writing", AppDetailWriting, "danholloran"],
  ["marketing", AppDetailMarketing, "grimicorn"],
])("%s template GitHub section", (_template, component, slug) => {
  function mountWith(detail = appDetailFixture({ slug, github: GITHUB })) {
    return mountDetailTemplate(
      component,
      toAppDetailViewModel(findAppBySlug(slug)!, detail),
    );
  }

  it("renders the Issues, PRs and CI tiles from the detail response", () => {
    const wrapper = mountWith();
    expect(wrapper.findComponent(GithubSection).exists()).toBe(true);
    const hrefs = wrapper
      .findAll("a.tile-link")
      .map((link) => link.attributes("href"));
    expect(hrefs).toEqual([
      GITHUB.issuesUrl,
      GITHUB.pullsUrl,
      GITHUB.repos[0]!.ciUrl,
    ]);
    expect(wrapper.find(".tile.danger").text()).toContain("FAILING");
  });

  it("renders not-configured when the token is unset", () => {
    const wrapper = mountWith(
      appDetailFixture({ slug, github: { ...GITHUB, configured: false } }),
    );
    expect(wrapper.text()).toContain("GitHub is not configured");
  });
});
