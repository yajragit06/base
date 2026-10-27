/**
 * Pure state for the lazily loaded page tree; the component wires it to the API.
 * The tree renders flat (ARIA `aria-level`, no groups): page rows plus one status row per
 * list for "Loading…", "Retry" or "Show more", all in the same roving focus.
 */

export interface NodeData {
  id: string;
  parentId: string | null;
  slug: string;
  uri: string;
  hasChildren: boolean;
}

export type LoadStatus = "idle" | "loading" | "loaded" | "error";

/** One parent's loaded children. The top level uses the key `ROOT`. */
export interface ChildList {
  ids: string[];
  nextCursor: string | null;
  status: LoadStatus;
  /** "Show more" or "Retry" was activated and the load has not started yet. */
  requested: boolean;
}

export const ROOT = "";

export interface TreeState {
  nodes: Record<string, NodeData>;
  children: Record<string, ChildList>;
  expanded: Record<string, boolean>;
  focusedId: string | null;
  selectedId: string | null;
}

export type TreeAction =
  | { type: "loadStart"; parent: string }
  | { type: "loadSuccess"; parent: string; items: NodeData[]; nextCursor: string | null }
  | { type: "loadError"; parent: string }
  | { type: "expand"; id: string }
  | { type: "collapse"; id: string }
  | { type: "focus"; id: string }
  | { type: "activate"; id: string }
  | { type: "key"; key: string };

export type Row =
  | {
      kind: "node";
      id: string;
      level: number;
      posInSet: number;
      /** -1 while more siblings can still be loaded (ARIA's "unknown size"). */
      setSize: number;
      node: NodeData;
      expanded: boolean;
    }
  | { kind: "more" | "retry" | "loading"; id: string; level: number; parent: string };

export interface PendingLoad {
  parent: string;
  after: string | null;
}

/** The id of a list's status row; page ids are UUIDs, so these never collide. */
export function statusId(parent: string): string {
  return `status:${parent}`;
}

export function initialState(items: NodeData[] = [], nextCursor: string | null = null): TreeState {
  const state: TreeState = {
    nodes: {},
    children: {},
    expanded: {},
    focusedId: null,
    selectedId: null,
  };
  return reduce(state, { type: "loadSuccess", parent: ROOT, items, nextCursor });
}

export function childList(state: TreeState, parent: string): ChildList {
  return state.children[parent] ?? { ids: [], nextCursor: null, status: "idle", requested: false };
}

/** The rows currently shown, in document order. */
export function visibleRows(state: TreeState): Row[] {
  const rows: Row[] = [];
  const walk = (parent: string, level: number) => {
    const list = childList(state, parent);
    list.ids.forEach((id, index) => {
      const node = state.nodes[id];
      if (!node) return;
      const expanded = node.hasChildren && state.expanded[id] === true;
      rows.push({
        kind: "node",
        id,
        level,
        posInSet: index + 1,
        setSize: list.nextCursor === null ? list.ids.length : -1,
        node,
        expanded,
      });
      if (expanded) walk(id, level + 1);
    });
    const kind =
      list.status === "loading" || list.requested
        ? "loading"
        : list.status === "error"
          ? "retry"
          : list.status === "loaded" && list.nextCursor !== null
            ? "more"
            : null;
    if (kind) rows.push({ kind, id: statusId(parent), level, parent });
  };
  walk(ROOT, 1);
  return rows;
}

/** Loads to start: newly expanded nodes, and activated "Show more" or "Retry" rows. */
export function pendingLoads(state: TreeState): PendingLoad[] {
  const loads: PendingLoad[] = [];
  for (const id of Object.keys(state.expanded)) {
    if (state.expanded[id] && childList(state, id).status === "idle") {
      loads.push({ parent: id, after: null });
    }
  }
  for (const [parent, list] of Object.entries(state.children)) {
    if (list.requested && list.status !== "loading") {
      loads.push({ parent, after: list.ids.length > 0 ? list.nextCursor : null });
    }
  }
  return loads;
}

export function reduce(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "loadStart": {
      const list = childList(state, action.parent);
      return withList(state, action.parent, { ...list, status: "loading", requested: false });
    }
    case "loadSuccess": {
      const list = childList(state, action.parent);
      const nodes = { ...state.nodes };
      const ids = [...list.ids];
      const added: string[] = [];
      for (const item of action.items) {
        if (!nodes[item.id]) {
          ids.push(item.id);
          added.push(item.id);
        }
        nodes[item.id] = item;
      }
      let focusedId = state.focusedId ?? ids[0] ?? null;
      // Focus was on this list's status row: move it to the first new page, keep it on
      // "Show more" if nothing new arrived, or fall back to the parent.
      if (focusedId === statusId(action.parent)) {
        const fallback = action.parent === ROOT ? (ids[0] ?? null) : action.parent;
        focusedId = added[0] ?? (action.nextCursor !== null ? focusedId : fallback);
      }
      return withList({ ...state, nodes, focusedId }, action.parent, {
        ids,
        nextCursor: action.nextCursor,
        status: "loaded",
        requested: false,
      });
    }
    case "loadError": {
      const list = childList(state, action.parent);
      return withList(state, action.parent, { ...list, status: "error", requested: false });
    }
    case "expand":
      return state.nodes[action.id]?.hasChildren
        ? { ...state, expanded: { ...state.expanded, [action.id]: true } }
        : state;
    case "collapse": {
      const expanded = { ...state.expanded };
      delete expanded[action.id];
      // Focus moves out of a collapsed subtree.
      const focusedId = isInside(state, state.focusedId, action.id) ? action.id : state.focusedId;
      return { ...state, expanded, focusedId };
    }
    case "focus":
      return visibleRows(state).some((row) => row.id === action.id && row.kind !== "loading")
        ? { ...state, focusedId: action.id }
        : state;
    case "activate":
      return activate(state, action.id);
    case "key":
      return onKey(state, action.key);
  }
}

function withList(state: TreeState, parent: string, list: ChildList): TreeState {
  return { ...state, children: { ...state.children, [parent]: list } };
}

function activate(state: TreeState, id: string): TreeState {
  const row = visibleRows(state).find((r) => r.id === id);
  if (!row) return state;
  if (row.kind === "node") return { ...state, selectedId: id, focusedId: id };
  if (row.kind === "loading") return state;
  const list = childList(state, row.parent);
  return withList({ ...state, focusedId: id }, row.parent, { ...list, requested: true });
}

/** Whether `id` (a page or a status row) lies inside the subtree under `ancestor`. */
function isInside(state: TreeState, id: string | null, ancestor: string): boolean {
  if (id === null) return false;
  // A status row belongs to its list's parent; a page row to its own parent.
  let current: string | null | undefined = id.startsWith("status:")
    ? id.slice("status:".length) || null
    : state.nodes[id]?.parentId;
  while (current) {
    if (current === ancestor) return true;
    current = state.nodes[current]?.parentId;
  }
  return false;
}

/** WAI-ARIA tree keyboard behaviour. Keys it does not handle leave the state unchanged. */
function onKey(state: TreeState, key: string): TreeState {
  const rows = visibleRows(state).filter((row) => row.kind !== "loading");
  if (rows.length === 0) return state;
  const index = Math.max(
    0,
    rows.findIndex((row) => row.id === state.focusedId),
  );
  const row = rows[index];
  if (!row) return state;
  const focus = (id: string | undefined) => (id ? { ...state, focusedId: id } : state);
  const parentOf = (r: Row) => (r.kind === "node" ? r.node.parentId : r.parent || null);

  switch (key) {
    case "ArrowDown":
      return focus(rows[index + 1]?.id);
    case "ArrowUp":
      return focus(rows[index - 1]?.id);
    case "Home":
      return focus(rows[0]?.id);
    case "End":
      return focus(rows.at(-1)?.id);
    case "ArrowRight":
      if (row.kind !== "node" || !row.node.hasChildren) return state;
      if (!row.expanded) return reduce(state, { type: "expand", id: row.id });
      return focus(childList(state, row.id).ids[0]);
    case "ArrowLeft":
      if (row.kind === "node" && row.expanded)
        return reduce(state, { type: "collapse", id: row.id });
      return focus(parentOf(row) ?? undefined);
    case "Enter":
    case " ":
      return activate(state, row.id);
    default:
      return state;
  }
}
