import p5 from "p5";
import Graph, { GraphOptions, GraphType } from "./graph";
import GraphNode from "./node";
import Spring from "./spring";

const DEFAULT_GRAPH = `1 2 1
1 3 5
2 6 3
4 6 2
5 6 3`;
const DEFAULT_GRAPH_OPTIONS: GraphOptions = {
  type: GraphType.EdgeList,
  bidirectional: true,
  weighted: true,
  startingIndex: 1,
};

// Internal representation of graph will always be adjacency list
let graph = Graph.parseGraph(DEFAULT_GRAPH, DEFAULT_GRAPH_OPTIONS);

new p5((p: p5) => {
  let nodes: Map<number, GraphNode> = new Map();
  let springs: Spring[] = [];

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);

    console.log(graph.adjlist);

    // Create nodes based on graph representation
    for (const [key] of graph.adjlist) {
      nodes.set(key, new GraphNode(p, key, p.random(p.width), p.random(p.height)));
    }

    // Create springs (dfs)
    const visited = new Set<number>();
    function dfs(idx: number, previous: number | null) {
      visited.add(idx);

      if (previous) {
        springs.push(new Spring(0.01, 200, nodes.get(idx)!, nodes.get(previous)!));
      }

      for (const next of graph.adjlist.get(idx)!) {
        if (!visited.has(next.first)) {
          dfs(next.first, idx);
        }
      }
    }
    dfs(graph.options.startingIndex, null);

  };

  p.draw = () => {
    p.background(0);

    for (const [, node] of nodes) {
      node.update();
      node.show(p);
    }

    for (const spring of springs) {
      spring.update();
      spring.show(p);
    }
  };
});
