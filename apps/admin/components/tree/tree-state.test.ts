import { describe, expect, it } from "vitest";
import {
  initialState,
  type NodeData,
  pendingLoads,
  ROOT,
  reduce,
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
    expect(visibleRows(state).map((r) => [r.id, r.level, r.posInSet, r.setSize])).toEqual([
      ["about", 1, 1, 3],
      ["blog", 1, 2, 3],
      ["contact", 1, 3, 3],
    ]);
    expect(state.focusedId).toBe("about");
  });

  it("expands lazily: an expanded node waits for a load, then shows its children", () => {
    let state = run(tree(), { type: "expand", id: "about" });
    expect(pendingLoads(state)).toEqual(["about"]);
    state = run(state, { type: "loadStart", parent: "about" });
    expect(pendingLoads(state)).toEqual([]);
    expect(state.children.about?.status).toBe("loading");
    state = loadAbout(state);
    expect(visibleRows(state).map((r) => [r.id, r.level])).toEqual([
      ["about", 1],
      ["team", 2],
      ["jobs", 2],
      ["blog", 1],
      ["contact", 1],
    ]);
    state = run(state, { type: "collapse", id: "about" });
    expect(visibleRows(state).map((r) => r.id)).toEqual(["about", "blog", "contact"]);
    // Children stay cached, so expanding again needs no load.
    state = run(state, { type: "expand", id: "about" });
    expect(pendingLoads(state)).toEqual([]);
  });

  it("does not expand a leaf", () => {
    const state = run(tree(), { type: "expand", id: "blog" });
    expect(state.expanded).toEqual({});
  });

  it("appends further pages and reports an unknown set size while more remain", () => {
    let state = initialState([node("a", null), node("b", null)], "cursor-1");
    expect(visibleRows(state).map((r) => r.setSize)).toEqual([-1, -1]);
    state = run(state, {
      type: "loadSuccess",
      parent: ROOT,
      items: [node("c", null), node("b", null)],
      nextCursor: null,
    });
    expect(visibleRows(state).map((r) => [r.id, r.setSize])).toEqual([
      ["a", 3],
      ["b", 3],
      ["c", 3],
    ]);
  });

  it("records a failed load per node, keeping what was loaded", () => {
    let state = run(
      tree(),
      { type: "expand", id: "about" },
      { type: "loadStart", parent: "about" },
      { type: "loadError", parent: "about" },
    );
    expect(state.children.about?.status).toBe("error");
    expect(visibleRows(state).map((r) => r.id)).toEqual(["about", "blog", "contact"]);
    state = loadAbout(state);
    expect(state.children.about?.status).toBe("loaded");
  });

  it("moves focus with the arrow keys, Home and End", () => {
    let state = loadAbout(run(tree(), { type: "expand", id: "about" }));
    state = run(state, key("ArrowDown"));
    expect(state.focusedId).toBe("team");
    state = run(state, key("End"));
    expect(state.focusedId).toBe("contact");
    state = run(state, key("ArrowDown"));
    expect(state.focusedId).toBe("contact");
    state = run(state, key("Home"), key("ArrowUp"));
    expect(state.focusedId).toBe("about");
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

  it("moves focus to the parent when its subtree collapses", () => {
    let state = loadAbout(run(tree(), { type: "expand", id: "about" }));
    state = run(state, { type: "focus", id: "jobs" }, { type: "collapse", id: "about" });
    expect(state.focusedId).toBe("about");
  });

  it("selects with Enter or Space", () => {
    let state = run(tree(), key("ArrowDown"), key("Enter"));
    expect(state.selectedId).toBe("blog");
    state = run(state, key("ArrowDown"), key(" "));
    expect(state.selectedId).toBe("contact");
    expect(run(state, key("x"))).toBe(state);
  });
});
