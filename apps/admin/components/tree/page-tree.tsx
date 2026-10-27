"use client";

import { ChevronRight, FileText, Loader2 } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { loadChildren } from "@/app/sites/[siteId]/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  childList,
  initialState,
  type NodeData,
  pendingLoads,
  ROOT,
  type Row,
  reduce,
  type TreeState,
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

/** The site's page tree: children load on expand, long lists page with "Show more". */
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

  const load = useCallback(
    async (parent: string, after: string | null) => {
      dispatch({ type: "loadStart", parent });
      const result = await loadChildren(siteId, parent === ROOT ? null : parent, after);
      if (result.ok) {
        dispatch({ type: "loadSuccess", parent, ...result.page });
      } else {
        dispatch({ type: "loadError", parent });
        setAnnouncement("Couldn't load pages.");
      }
    },
    [siteId],
  );

  useEffect(() => {
    for (const parent of pendingLoads(state)) void load(parent, null);
  }, [state, load]);

  // Keep DOM focus on the focused item while the tree has focus (roving tabindex).
  useEffect(() => {
    if (!treeRef.current?.contains(document.activeElement) || state.focusedId === null) return;
    treeRef.current
      .querySelector<HTMLElement>(`[data-id="${CSS.escape(state.focusedId)}"]`)
      ?.focus();
  }, [state.focusedId]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Only keys pressed on a tree item; buttons such as "Show more" keep their own keys.
    if (!HANDLED_KEYS.has(event.key)) return;
    if ((event.target as HTMLElement).getAttribute("role") !== "treeitem") return;
    event.preventDefault();
    dispatch({ type: "key", key: event.key });
  };

  const top = childList(state, ROOT);
  if (top.ids.length === 0 && top.status !== "loading") {
    return <p className="px-3 py-2 text-sm text-muted-foreground">No pages yet.</p>;
  }

  return (
    <>
      <div ref={treeRef} role="tree" aria-label="Pages" className="text-sm" onKeyDown={onKeyDown}>
        <Branch parent={ROOT} level={1} state={state} dispatch={dispatch} load={load} />
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

type Dispatch = (action: Parameters<typeof reduce>[1]) => void;

function Branch({
  parent,
  level,
  state,
  dispatch,
  load,
}: {
  parent: string;
  level: number;
  state: TreeState;
  dispatch: Dispatch;
  load: (parent: string, after: string | null) => Promise<void>;
}) {
  const list = childList(state, parent);
  return (
    <>
      {list.ids.map((id, index) => {
        const node = state.nodes[id];
        if (!node) return null;
        const row: Row = {
          id,
          level,
          posInSet: index + 1,
          setSize: list.nextCursor === null ? list.ids.length : -1,
          node,
          expanded: node.hasChildren && state.expanded[id] === true,
        };
        return <Item key={id} row={row} state={state} dispatch={dispatch} load={load} />;
      })}
      <ListStatus parent={parent} level={level} state={state} load={load} />
    </>
  );
}

function Item({
  row,
  state,
  dispatch,
  load,
}: {
  row: Row;
  state: TreeState;
  dispatch: Dispatch;
  load: (parent: string, after: string | null) => Promise<void>;
}) {
  const { node } = row;
  const selected = state.selectedId === node.id;
  return (
    // Keyboard input is handled once on the tree (roving tabindex), not per item.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the tree container handles keys for every item
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
      className="outline-none focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-ring"
      onClick={(event) => {
        event.stopPropagation();
        dispatch({ type: "select", id: node.id });
      }}
    >
      <div
        className={cn(
          "flex items-center gap-1 rounded-sm py-1 pr-2 hover:bg-accent",
          selected && "bg-accent text-accent-foreground font-medium",
        )}
        style={{ paddingLeft: `${(row.level - 1) * 16 + 4}px` }}
      >
        {node.hasChildren ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-muted"
            onClick={(event) => {
              event.stopPropagation();
              dispatch({ type: row.expanded ? "collapse" : "expand", id: node.id });
            }}
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform", row.expanded && "rotate-90")}
            />
          </button>
        ) : (
          <span className="size-5" />
        )}
        <FileText aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate" title={node.uri}>
          {node.slug}
        </span>
      </div>
      {row.expanded && (
        // biome-ignore lint/a11y/useSemanticElements: an ARIA tree groups child items with role="group", not a fieldset
        <div role="group">
          <Branch
            parent={node.id}
            level={row.level + 1}
            state={state}
            dispatch={dispatch}
            load={load}
          />
        </div>
      )}
    </div>
  );
}

/** Loading, error and "Show more" rows under a list; they are not tree items. */
function ListStatus({
  parent,
  level,
  state,
  load,
}: {
  parent: string;
  level: number;
  state: TreeState;
  load: (parent: string, after: string | null) => Promise<void>;
}) {
  const list = childList(state, parent);
  const indent = { paddingLeft: `${(level - 1) * 16 + 28}px` };
  if (list.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-1 text-muted-foreground" style={indent}>
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        Loading…
      </div>
    );
  }
  if (list.status === "error") {
    return (
      <div className="flex items-center gap-2 py-1 text-destructive" style={indent}>
        Couldn't load.
        <Button
          variant="link"
          size="xs"
          onClick={() => void load(parent, list.ids.length > 0 ? list.nextCursor : null)}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (list.nextCursor !== null) {
    return (
      <div style={indent}>
        <Button variant="ghost" size="xs" onClick={() => void load(parent, list.nextCursor)}>
          Show more
        </Button>
      </div>
    );
  }
  return null;
}
