import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import GithubItemList from "../../app/components/GithubItemList.vue";
import GithubSection from "../../app/components/GithubSection.vue";
import GithubTiles from "../../app/components/GithubTiles.vue";
import { DETAIL_COMPONENTS } from "./support/detailComponents";
import { buildCiRepoRows, buildGithubTiles } from "../../app/utils/githubPanel";
import type {
  GithubDetail,
  GithubItem,
  GithubRepoSummary,
} from "../../shared/types/dashboard";

function repo(
  name: string,
  overrides: Partial<GithubRepoSummary> = {},
): GithubRepoSummary {
  return {
    repo: name,
    synced: true,
    openIssues: 2,
    openPrs: 1,
    ciState: "passing",
    ciUrl: `https://github.com/neonpixels-studio/${name}/commit/abc/checks`,
    repoUrl: `https://github.com/neonpixels-studio/${name}`,
    ...overrides,
  };
}

function item(
  repoName: string,
  number: number,
  overrides: Partial<GithubItem> = {},
): GithubItem {
  return {
    repo: repoName,
    number,
    kind: "issue",
    title: `Item ${number}`,
    url: `https://github.com/neonpixels-studio/${repoName}/issues/${number}`,
    labels: [],
    updatedAt: "2026-10-09T12:00:00.000Z",
    ...overrides,
  };
}

const SINGLE_REPO: GithubDetail = {
  configured: true,
  repos: [repo("basin")],
  issuesUrl: "https://github.com/neonpixels-studio/basin/issues",
  pullsUrl: "https://github.com/neonpixels-studio/basin/pulls",
  items: [
    item("basin", 12, { title: "Fix feed parser", labels: ["bug", "p1"] }),
    item("basin", 9, { kind: "pr", title: "Add OPML import" }),
  ],
};

const MULTI_REPO: GithubDetail = {
  configured: true,
  repos: [repo("markpost"), repo("markpost-cli", { ciState: "failing" })],
  issuesUrl: "https://github.com/issues?q=x",
  pullsUrl: "https://github.com/pulls?q=x",
  items: [
    item("markpost-cli", 7, { kind: "pr", title: "Fix flags" }),
    item("markpost", 7, { title: "Webhook retries" }),
  ],
};

const EMPTY: GithubDetail = {
  ...SINGLE_REPO,
  repos: [repo("basin", { openIssues: 0, openPrs: 0 })],
  items: [],
};

const NOT_CONFIGURED: GithubDetail = {
  configured: false,
  repos: [
    repo("basin", {
      synced: false,
      openIssues: null,
      openPrs: null,
      ciState: null,
    }),
  ],
  issuesUrl: SINGLE_REPO.issuesUrl,
  pullsUrl: SINGLE_REPO.pullsUrl,
  items: [],
};

function mountSection(github: GithubDetail) {
  return mount(GithubSection, {
    props: { github },
    global: { components: DETAIL_COMPONENTS },
  });
}

function mountTiles(github: GithubDetail) {
  return mount(GithubTiles, {
    props: {
      tiles: buildGithubTiles(github),
      ciRepoRows: buildCiRepoRows(github),
    },
    global: { components: DETAIL_COMPONENTS },
  });
}

describe("GithubTiles", () => {
  it("renders the passing single-repo tiles", () => {
    expect(mountTiles(SINGLE_REPO).html()).toMatchSnapshot();
  });

  it("renders a failing CI tile", () => {
    const failing = {
      ...SINGLE_REPO,
      repos: [repo("basin", { ciState: "failing" })],
    };
    const wrapper = mountTiles(failing);
    expect(wrapper.html()).toMatchSnapshot();
    expect(wrapper.find(".tile.danger").text()).toContain("FAILING");
  });

  it("renders summed tiles with a per-repo CI breakdown for markpost", () => {
    const wrapper = mountTiles(MULTI_REPO);
    expect(wrapper.html()).toMatchSnapshot();
    const links = wrapper.findAll(".ci-repo-link");
    expect(links.map((link) => link.text())).toEqual([
      "markpost: passing",
      "markpost-cli: failing",
    ]);
  });

  it("links every tile to GitHub", () => {
    const hrefs = mountTiles(SINGLE_REPO)
      .findAll("a.tile-link")
      .map((link) => link.attributes("href"));
    expect(hrefs).toEqual([
      "https://github.com/neonpixels-studio/basin/issues",
      "https://github.com/neonpixels-studio/basin/pulls",
      "https://github.com/neonpixels-studio/basin/commit/abc/checks",
    ]);
  });
});

describe("GithubItemList", () => {
  it("renders number, title, labels and a PR marker, each linked", () => {
    const wrapper = mount(GithubItemList, {
      props: { items: SINGLE_REPO.items, showRepo: false },
    });
    expect(wrapper.html()).toMatchSnapshot();
    const rows = wrapper.findAll("li.item");
    expect(rows[0]!.find(".badge").text()).toBe("Issue");
    expect(rows[1]!.find(".badge").text()).toBe("PR");
    expect(rows[0]!.findAll(".chip").map((chip) => chip.text())).toEqual([
      "bug",
      "p1",
    ]);
    expect(rows[0]!.find("a").attributes("href")).toBe(
      "https://github.com/neonpixels-studio/basin/issues/12",
    );
  });

  it("names the repo on each row when several repos share a page", () => {
    const wrapper = mount(GithubItemList, {
      props: { items: MULTI_REPO.items, showRepo: true },
    });
    expect(wrapper.html()).toMatchSnapshot();
    expect(wrapper.findAll(".item-ref").map((ref) => ref.text())).toEqual([
      "markpost-cli#7",
      "markpost#7",
    ]);
  });

  it("renders the empty state", () => {
    const wrapper = mount(GithubItemList, {
      props: { items: [], showRepo: false },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});

describe("GithubSection", () => {
  it("renders tiles and the list when configured", () => {
    expect(mountSection(SINGLE_REPO).html()).toMatchSnapshot();
  });

  it("renders the empty state", () => {
    const wrapper = mountSection(EMPTY);
    expect(wrapper.html()).toMatchSnapshot();
    expect(wrapper.text()).toContain("No open issues or pull requests.");
  });

  it("renders the failing state", () => {
    const wrapper = mountSection({
      ...SINGLE_REPO,
      repos: [repo("basin", { ciState: "failing" })],
    });
    expect(wrapper.html()).toMatchSnapshot();
    expect(wrapper.text()).toContain("FAILING");
  });

  it("renders not-configured instead of empty counts when the token is unset", () => {
    const wrapper = mountSection(NOT_CONFIGURED);
    expect(wrapper.html()).toMatchSnapshot();
    expect(wrapper.text()).toContain("GitHub is not configured");
    expect(wrapper.find(".github-tiles").exists()).toBe(false);
    expect(wrapper.find(".item-list").exists()).toBe(false);
  });

  it("renders a configured but never-synced property with dashes", () => {
    const wrapper = mountSection({
      ...NOT_CONFIGURED,
      configured: true,
    });
    expect(wrapper.html()).toMatchSnapshot();
    expect(wrapper.findAll(".value").map((value) => value.text())).toEqual([
      "—",
      "—",
      "—",
    ]);
  });
});
