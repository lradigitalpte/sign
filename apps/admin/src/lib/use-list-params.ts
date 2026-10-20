import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

/** Search text, status filter and page for list pages, kept in the URL so links and Back work. */
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("query") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  // The input updates immediately; the URL (and the request) follow after a short pause.
  const [draft, setDraft] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft === query) return;
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (draft) next.set("query", draft);
          else next.delete("query");
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, query, setSearchParams]);

  const update = (key: "status" | "page", value: string) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value && !(key === "page" && value === "1")) next.set(key, value);
      else next.delete(key);
      if (key === "status") next.delete("page");
      return next;
    });

  return {
    draft,
    setDraft,
    query,
    status,
    page,
    setStatus: (value: string) => update("status", value),
    setPage: (value: number) => update("page", String(value)),
  };
}
