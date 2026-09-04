"use client";

import { useEffect, useState } from "react";

// True from 1024px up, where the rail is visible and the editor has room for
// a live preview next to the list. Starts false so the server render and the
// phone agree, and so the preview's modules never mount on a small screen.
export function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return desktop;
}
