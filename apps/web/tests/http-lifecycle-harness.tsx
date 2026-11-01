import { StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useWorkspace } from "../src/lib/use-workspace";

declare global {
  interface Window {
    lifecycle: {
      current?: ReturnType<typeof useWorkspace>;
      mount(): void;
      unmount(): void;
      release?: () => void | Promise<void>;
      downloads?: number;
    };
  }
}
function Probe() {
  const workspace = useWorkspace();
  useLayoutEffect(() => {
    window.lifecycle.current = workspace;
    return () => { window.lifecycle.current = undefined; };
  }, [workspace]);
  return <output>{workspace.run?.status ?? (workspace.report ? "report" : "idle")}</output>;
}
const container = document.getElementById("root")!;
let root: Root | undefined;
window.lifecycle = {
  mount() {
    root = createRoot(container);
    flushSync(() => root!.render(<StrictMode><Probe /></StrictMode>));
  },
  unmount() {
    flushSync(() => root?.unmount());
    root = undefined;
  },
};
window.lifecycle.mount();
