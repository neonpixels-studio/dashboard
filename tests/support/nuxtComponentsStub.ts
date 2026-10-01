// Stand-in for Nuxt's `#components` virtual module under plain vitest (see
// the alias in vitest.config.ts). Each template renders an empty element so
// page tests can assert on the page's own wiring.
const stub = { template: "<div />" };

export const AppDetailProduct = stub;
export const AppDetailWriting = stub;
export const AppDetailMarketing = stub;
