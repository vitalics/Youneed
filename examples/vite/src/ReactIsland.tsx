// A React island that embeds our <dom-stepper> Web Component. React owns its own
// state; it syncs to the component via a ref (set the initial attribute, listen
// for the custom `change` event). This is the framework-agnostic interop path.

import { useEffect, useRef, useState } from "react";

export function ReactIsland({ start = 0 }: { start?: number }) {
  const ref = useRef<HTMLElement>(null);
  const [val, setVal] = useState(start);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = (e: Event) => setVal((e as CustomEvent<number>).detail);
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="card">
      <h3>⚛️ React island</h3>
      <p>
        React state mirrors the Web Component: <b>{val}</b>
      </p>
      {/* our custom element, rendered inside the React tree */}
      <dom-stepper ref={ref} value={String(start)} />
    </div>
  );
}
