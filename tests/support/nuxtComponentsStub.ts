// Stand-in for Nuxt's `#components` virtual module under plain vitest (see
// the alias in vitest.config.ts). Each template renders an empty element so
// page tests can assert on the page's own wiring. Any new `#components`
// import used by a page under test must be added here, or it resolves to
// undefined.
const stub = { template: "<div />" };

export const AppDetailProduct = stub;
export const AppDetailWriting = stub;
export const AppDetailMarketing = stub;
