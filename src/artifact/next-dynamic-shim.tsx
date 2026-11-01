// Stand-in for next/dynamic in the static bundle: React.lazy + Suspense.
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

export default function dynamic<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, opts?: { loading?: () => ReactNode }) {
  const C = lazy(load);
  return function Dynamic(props: P) {
    return <Suspense fallback={opts?.loading?.() ?? null}><C {...props} /></Suspense>;
  };
}
