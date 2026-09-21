import { mount } from "@vue/test-utils";
import { vi } from "vitest";
import type { Component } from "vue";
import { DETAIL_COMPONENTS } from "./detailComponents";
import type { AppDetailViewModel } from "../../../app/utils/appViewModel";

// The three AppDetail*.test.ts suites all mount their template the same
// way — real `app` view model, plus the pending/error/refresh trio every
// template takes (app/utils/appViewModel.ts's AppDetailTemplateProps) —
// factored out once it was the same mount-options type and defaults
// repeated identically across all three files.
export interface MountDetailOptions {
  pending?: boolean;
  error?: unknown;
  refresh?: () => Promise<void>;
}

export function mountDetailTemplate(
  component: Component,
  app: AppDetailViewModel,
  { pending = false, error = null, refresh = vi.fn() }: MountDetailOptions = {},
) {
  return mount(component, {
    props: { app, pending, error, refresh },
    global: { components: DETAIL_COMPONENTS },
  });
}
