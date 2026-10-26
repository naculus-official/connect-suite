import { effectScope } from "vue";

/** Run a composable inside a detached effect scope so tests can dispose it. */
export function inScope<T>(fn: () => T) {
  const scope = effectScope();
  let api!: T;
  scope.run(() => {
    api = fn();
  });
  return { api, scope };
}
