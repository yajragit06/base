import { describe, expect, it } from "vitest";
import {
  initialState,
  type NodeData,
  pendingLoads,
  ROOT,
  reduce,
  statusId,
  type TreeAction,
  type TreeState,
  visibleRows,
} from "./tree-state";

const node = (id: string, parentId: string | null, hasChildren = false): NodeData => ({
  id,
  parentId,
  slug: id,
  uri: `/${id}`,
  hasChildren,
});

function run(state: TreeState, ...actions: TreeAction[]): TreeState {
  return actions.reduce(reduce, state);
}

const key = (k: string): TreeAction => ({ type: "key", key: k });
const ids = (state: TreeState) => visibleRows(state).map((r) => r.id);

// about (has children: team, jobs), blog, contact
function tree(): TreeState {
  return initialState([node("about", null, true), node("blog", null), node("contact", null)], null);
}

function loadAbout(state: TreeState): TreeState {
  return run(
    state,
    { type: "loadStart", parent: "about" },
    {
      type: "loadSuccess",
      parent: "about",
      items: [node("team", "about"), node("jobs", "about")],
      nextCursor: null,
    },
  );
}

describe("tree state", () => {
  it("starts with the top level loaded and the first node focused", () => {
    const state = tree();
    expect(
      visibleRows(state).map((r) =>
        r.kind === "node" ? [r.id, r.level, r.posInSet, r.setSize] : r.id,
      ),
    ).toEqual([
      ["about", 1, 1, 3],
      ["blog", 1, 2, 3],
      ["contact", 1, 3, 3],
    ]);
    expect(state.focusedId).toBe("about");
  });

  it("expands lazily: an expanded node waits for a load, then shows its children", () => {
    let state = run(tree(), { type: "expand", id: "about" });
    expect(pendingLoads(state)).toEqual([{ parent: "about", after: null }]);
    state = run(state, { type: "loadStart", parent: "about" });
    expect(pendingLoads(state)).toEqual([]);
    expect(ids(state)).toEqual(["about", statusId("about"), "blog", "contact"]);
    expect(visibleRows(state)[1]).toMatchObject({ kind: "loading", level: 2 });
    state = loadAbout(state);
    expect(visibleRows(state).map((r) => [r.id, r.level])).toEqual([
      ["about", 1],
      ["team", 2],
      ["jobs", 2],
      ["blog", 1],
      ["contact", 1],
    ]);
    state = run(state, { type: "collapse", id: "about" });
    expect(ids(state)).toEqual(["about", "blog", "contact"]);
    // Children stay cached, so expanding again needs no load.
    state = run(state, { type: "expand", id: "about" });
    expect(pendingLoads(state)).toEqual([]);
  });

  it("does not expand a leaf", () => {
    const state = run(tree(), { type: "expand", id: "blog" });
    expect(state.expanded).toEqual({});
  });

  it("shows Show more while pages remain, and loads the next page when activated", () => {
    let state = initialState([node("a", null), node("b", null)], "cursor-1");
    expect(visibleRows(state).map((r) => (r.kind === "node" ? r.setSize : r.kind))).toEqual([
      -1,
      -1,
      "more",
    ]);
    // Keyboard: End reaches "Show more", Enter activates it.
    state = run(state, key("End"));
    expect(state.focusedId).toBe(statusId(ROOT));
    state = run(state, key("Enter"));
    expect(pendingLoads(state)).toEqual([{ parent: ROOT, after: "cursor-1" }]);
    state = run(state, { type: "loadStart", parent: ROOT });
    expect(visibleRows(state).at(-1)).toMatchObject({ kind: "loading" });
    state = run(state, {
      type: "loadSuccess",
      parent: ROOT,
      items: [node("c", null), node("b", null)],
      nextCursor: null,
    });
    expect(visibleRows(state).map((r) => (r.kind === "node" ? [r.id, r.setSize] : r.kind))).toEqual(
      [
        ["a", 3],
        ["b", 3],
        ["c", 3],
      ],
    );
    // Focus moves to the first new page.
    expect(state.focusedId).toBe("c");
  });

  it("offers Retry after a failed load and retries on Space", () => {
    let state = run(
      tree(),
      { type: "expand", id: "about" },
      { type: "loadStart", parent: "about" },
      { type: "loadError", parent: "about" },
    );
    expect(ids(state)).toEqual(["about", statusId("about"), "blog", "contact"]);
    expect(visibleRows(state)[1]).toMatchObject({ kind: "retry" });
    expect(pendingLoads(state)).toEqual([]);
    state = run(state, key("ArrowDown"), key(" "));
    expect(pendingLoads(state)).toEqual([{ parent: "about", after: null }]);
    state = loadAbout(state);
    expect(state.children.about?.status).toBe("loaded");
    expect(state.focusedId).toBe("team");
  });

  it("skips loading rows and moves focus with the arrow keys, Home and End", () => {
    let state = loadAbout(run(tree(), { type: "expand", id: "about" }));
    state = run(state, key("ArrowDown"));
    expect(state.focusedId).toBe("team");
    state = run(state, key("End"));
    expect(state.focusedId).toBe("contact");
    state = run(state, key("ArrowDown"));
    expect(state.focusedId).toBe("contact");
    state = run(state, key("Home"), key("ArrowUp"));
    expect(state.focusedId).toBe("about");

    const loading = run(
      tree(),
      { type: "expand", id: "about" },
      { type: "loadStart", parent: "about" },
    );
    expect(run(loading, key("ArrowDown")).focusedId).toBe("blog");
    expect(run(loading, { type: "focus", id: statusId("about") }).focusedId).toBe("about");
  });

  it("uses Right to expand then enter, and Left to collapse then go to the parent", () => {
    let state = run(tree(), key("ArrowRight"));
    expect(state.expanded.about).toBe(true);
    state = loadAbout(state);
    state = run(state, key("ArrowRight"));
    expect(state.focusedId).toBe("team");
    state = run(state, key("ArrowRight"));
    expect(state.focusedId).toBe("team");
    state = run(state, key("ArrowLeft"));
    expect(state.focusedId).toBe("about");
    state = run(state, key("ArrowLeft"));
    expect(state.expanded.about).toBeUndefined();
    expect(state.focusedId).toBe("about");
  });

  it("moves focus to the parent when its subtree collapses, from a page or a status row", () => {
    let state = loadAbout(run(tree(), { type: "expand", id: "about" }));
    state = run(state, { type: "focus", id: "jobs" }, { type: "collapse", id: "about" });
    expect(state.focusedId).toBe("about");

    state = run(
      tree(),
      { type: "expand", id: "about" },
      { type: "loadStart", parent: "about" },
      { type: "loadError", parent: "about" },
      { type: "focus", id: statusId("about") },
      key("ArrowLeft"),
    );
    expect(state.focusedId).toBe("about");
    state = run(state, { type: "focus", id: statusId("about") }, { type: "collapse", id: "about" });
    expect(state.focusedId).toBe("about");
  });

  it("selects pages with Enter or Space", () => {
    let state = run(tree(), key("ArrowDown"), key("Enter"));
    expect(state.selectedId).toBe("blog");
    state = run(state, key("ArrowDown"), key(" "));
    expect(state.selectedId).toBe("contact");
    expect(run(state, key("x"))).toBe(state);
  });

  it("ignores keys while focus rests on a loading row, then moves to the first new page", () => {
    let state = initialState([node("a", null), node("b", null)], "cursor-1");
    state = run(state, key("End"), key("Enter"), { type: "loadStart", parent: ROOT });
    expect(state.focusedId).toBe(statusId(ROOT));
    for (const k of ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "ArrowLeft"]) {
      expect(run(state, key(k))).toBe(state);
    }
    // The last page arrives: the status row goes away and focus lands on the first new page.
    state = run(state, {
      type: "loadSuccess",
      parent: ROOT,
      items: [node("c", null)],
      nextCursor: null,
    });
    expect(ids(state)).toEqual(["a", "b", "c"]);
    expect(state.focusedId).toBe("c");
    expect(state.selectedId).toBeNull();
  });
});
