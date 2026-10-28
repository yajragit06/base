"use client";

import { ChevronRight, FileText, Loader2, RotateCw } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { loadChildren } from "@/app/sites/[siteId]/actions";
import { cn } from "@/lib/utils";
import {
  childList,
  initialState,
  type NodeData,
  pendingLoads,
  ROOT,
  type Row,
  reduce,
  type TreeAction,
  type TreeState,
  visibleRows,
} from "./tree-state";

const HANDLED_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "Enter",
  " ",
]);

const indent = (level: number) => ({ paddingLeft: `${(level - 1) * 16 + 4}px` });

/**
 * The site's page tree: children load on expand, long lists page with "Show more". It is
 * a flat WAI-ARIA tree (`aria-level`, one roving tabindex); status rows ("Loading…",
 * "Retry", "Show more") are tree items too, so the tree owns only tree items.
 */
export function PageTree({
  siteId,
  initialItems,
  initialCursor,
}: {
  siteId: string;
  initialItems: NodeData[];
  initialCursor: string | null;
}) {
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    initialState(initialItems, initialCursor),
  );
  const [announcement, setAnnouncement] = useState("");
  const treeRef = useRef<HTMLDivElement>(null);
  // Whether keyboard focus was last inside the tree. A removed row (a status row after the
  // last page loads) drops DOM focus to the body, which must not count as leaving.
  const focusWithin = useRef(false);

  const load = useCallback(
    async (parent: string, after: string | null) => {
      dispatch({ type: "loadStart", parent });
      const result = await loadChildren(siteId, parent === ROOT ? null : parent, after);
      if (result.ok) {
        dispatch({ type: "loadSuccess", parent, ...result.page });
      } else {
        dispatch({ type: "loadError", parent });
        setAnnouncement("Couldn't load pages. Use Retry to try again.");
      }
    },
    [siteId],
  );

  useEffect(() => {
    for (const { parent, after } of pendingLoads(state)) void load(parent, after);
  }, [state, load]);

  // Keep DOM focus on the focused row while the tree has focus (roving tabindex).
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree || state.focusedId === null) return;
    const active = document.activeElement;
    const inTree = tree.contains(active);
    const dropped = focusWithin.current && (active === null || active === document.body);
    if (!inTree && !dropped) return;
    tree.querySelector<HTMLElement>(`[data-id="${CSS.escape(state.focusedId)}"]`)?.focus();
  }, [state.focusedId]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!HANDLED_KEYS.has(event.key)) return;
    event.preventDefault();
    dispatch({ type: "key", key: event.key });
  };

  const top = childList(state, ROOT);
  if (top.ids.length === 0 && top.status === "loaded" && top.nextCursor === null) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">No pages yet.</p>;
  }

  return (
    <>
      <div
        ref={treeRef}
        role="tree"
        aria-label="Pages"
        className="text-sm"
        onKeyDown={onKeyDown}
        onFocus={() => {
          focusWithin.current = true;
        }}
        onBlur={(event) => {
          // Only a move to another element outside the tree counts as leaving it.
          const next = event.relatedTarget;
          if (next instanceof Node && !event.currentTarget.contains(next)) {
            focusWithin.current = false;
          }
        }}
      >
        {visibleRows(state).map((row) =>
          row.kind === "node" ? (
            <PageRow key={row.id} row={row} state={state} dispatch={dispatch} />
          ) : (
            <StatusRow key={row.id} row={row} state={state} dispatch={dispatch} />
          ),
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

type Dispatch = (action: TreeAction) => void;

function PageRow({
  row,
  state,
  dispatch,
}: {
  row: Extract<Row, { kind: "node" }>;
  state: TreeState;
  dispatch: Dispatch;
}) {
  const { node } = row;
  const selected = state.selectedId === node.id;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the tree container handles keys for every row
    <div
      role="treeitem"
      data-id={node.id}
      aria-level={row.level}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-expanded={node.hasChildren ? row.expanded : undefined}
      aria-selected={selected}
      aria-busy={row.expanded && childList(state, node.id).status === "loading"}
      tabIndex={state.focusedId === node.id ? 0 : -1}
      className={cn(
        "flex cursor-default items-center gap-1 rounded-sm py-1 pr-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-accent font-medium text-accent-foreground",
      )}
      style={indent(row.level)}
      onClick={() => dispatch({ type: "activate", id: node.id })}
    >
      {node.hasChildren ? (
        // Not a button: it never takes focus, so the arrow keys keep working after a click.
        <span
          aria-hidden="true"
          className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-muted"
          onClick={(event) => {
            event.stopPropagation();
            dispatch({ type: "focus", id: node.id });
            dispatch({ type: row.expanded ? "collapse" : "expand", id: node.id });
          }}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", row.expanded && "rotate-90")}
          />
        </span>
      ) : (
        <span className="size-5" />
      )}
      <FileText aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate" title={node.uri}>
        {node.slug}
      </span>
    </div>
  );
}

/** "Loading…", "Retry" or "Show more" under a list: a tree item in the same roving focus. */
function StatusRow({
  row,
  state,
  dispatch,
}: {
  row: Exclude<Row, { kind: "node" }>;
  state: TreeState;
  dispatch: Dispatch;
}) {
  const label =
    row.kind === "loading"
      ? "Loading…"
      : row.kind === "retry"
        ? "Couldn't load. Retry"
        : "Show more";
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the tree container handles keys for every row
    <div
      role="treeitem"
      data-id={row.id}
      aria-level={row.level}
      aria-selected={false}
      aria-busy={row.kind === "loading"}
      aria-disabled={row.kind === "loading"}
      tabIndex={state.focusedId === row.id ? 0 : -1}
      className={cn(
        "flex items-center gap-1.5 rounded-sm py-1 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
        row.kind === "loading" && "text-muted-foreground",
        row.kind === "retry" && "cursor-pointer text-destructive hover:bg-accent",
        row.kind === "more" && "cursor-pointer text-primary hover:bg-accent",
      )}
      style={{ paddingLeft: `${(row.level - 1) * 16 + 28}px` }}
      onClick={() => dispatch({ type: "activate", id: row.id })}
    >
      {row.kind === "loading" && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
      {row.kind === "retry" && <RotateCw aria-hidden="true" className="size-3.5" />}
      {label}
    </div>
  );
}
