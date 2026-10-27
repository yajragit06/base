/** Pure state for the lazily loaded page tree; the component wires it to the API. */

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
  | { type: "select"; id: string }
  | { type: "key"; key: string };

export interface Row {
  id: string;
  level: number;
  posInSet: number;
  /** -1 while more siblings can still be loaded (ARIA's "unknown size"). */
  setSize: number;
  node: NodeData;
  expanded: boolean;
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
  return state.children[parent] ?? { ids: [], nextCursor: null, status: "idle" };
}

/** The tree items currently shown, in document order. */
export function visibleRows(state: TreeState): Row[] {
  const rows: Row[] = [];
  const walk = (parent: string, level: number) => {
    const list = childList(state, parent);
    list.ids.forEach((id, index) => {
      const node = state.nodes[id];
      if (!node) return;
      const expanded = node.hasChildren && state.expanded[id] === true;
      rows.push({
        id,
        level,
        posInSet: index + 1,
        setSize: list.nextCursor === null ? list.ids.length : -1,
        node,
        expanded,
      });
      if (expanded) walk(id, level + 1);
    });
  };
  walk(ROOT, 1);
  return rows;
}

/** Expanded parents whose children have not been requested yet. */
export function pendingLoads(state: TreeState): string[] {
  return Object.keys(state.expanded).filter(
    (id) => state.expanded[id] && childList(state, id).status === "idle",
  );
}

export function reduce(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "loadStart": {
      const list = childList(state, action.parent);
      return {
        ...state,
        children: { ...state.children, [action.parent]: { ...list, status: "loading" } },
      };
    }
    case "loadSuccess": {
      const list = childList(state, action.parent);
      const nodes = { ...state.nodes };
      const ids = [...list.ids];
      for (const item of action.items) {
        if (!nodes[item.id]) ids.push(item.id);
        nodes[item.id] = item;
      }
      const focusedId = state.focusedId ?? ids[0] ?? null;
      return {
        ...state,
        nodes,
        focusedId,
        children: {
          ...state.children,
          [action.parent]: { ids, nextCursor: action.nextCursor, status: "loaded" },
        },
      };
    }
    case "loadError": {
      const list = childList(state, action.parent);
      return {
        ...state,
        children: { ...state.children, [action.parent]: { ...list, status: "error" } },
      };
    }
    case "expand":
      return state.nodes[action.id]?.hasChildren
        ? { ...state, expanded: { ...state.expanded, [action.id]: true } }
        : state;
    case "collapse": {
      const expanded = { ...state.expanded };
      delete expanded[action.id];
      // Focus moves out of a collapsed subtree.
      const focusedId = isDescendant(state, state.focusedId, action.id)
        ? action.id
        : state.focusedId;
      return { ...state, expanded, focusedId };
    }
    case "focus":
      return state.nodes[action.id] ? { ...state, focusedId: action.id } : state;
    case "select":
      return state.nodes[action.id]
        ? { ...state, selectedId: action.id, focusedId: action.id }
        : state;
    case "key":
      return onKey(state, action.key);
  }
}

function isDescendant(state: TreeState, id: string | null, ancestor: string): boolean {
  let current = id === null ? undefined : state.nodes[id];
  while (current?.parentId) {
    if (current.parentId === ancestor) return true;
    current = state.nodes[current.parentId];
  }
  return false;
}

/** WAI-ARIA tree keyboard behaviour. Keys it does not handle leave the state unchanged. */
function onKey(state: TreeState, key: string): TreeState {
  const rows = visibleRows(state);
  if (rows.length === 0) return state;
  const index = Math.max(
    0,
    rows.findIndex((row) => row.id === state.focusedId),
  );
  const row = rows[index];
  if (!row) return state;
  const focus = (id: string | undefined) => (id ? { ...state, focusedId: id } : state);

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
      if (!row.node.hasChildren) return state;
      if (!row.expanded) return reduce(state, { type: "expand", id: row.id });
      return focus(childList(state, row.id).ids[0]);
    case "ArrowLeft":
      if (row.expanded) return reduce(state, { type: "collapse", id: row.id });
      return focus(row.node.parentId ?? undefined);
    case "Enter":
    case " ":
      return reduce(state, { type: "select", id: row.id });
    default:
      return state;
  }
}
