export const GITHUB_VENDOR = "github";
export const GITHUB_ORG = "neonpixels-studio";
export const GITHUB_MAIN_BRANCH = "main";
export const GITHUB_TOKEN_ENV = "NUXT_GITHUB_TOKEN";

// A property whose GitHub footprint is more than one repo. Every other
// property is the single repo named after its slug.
const REPOS_BY_PROPERTY: Record<string, string[]> = {
  markpost: ["markpost", "markpost-cli"],
};

export function reposForProperty(slug: string): string[] {
  return REPOS_BY_PROPERTY[slug] ?? [slug];
}
