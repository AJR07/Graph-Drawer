import debounce from "lodash.debounce";
import p5 from "p5";
import Vue from "vue";
import "../style.css";
import clamp from "./clamp";
import Edge, { DEFAULT_EDGE_DISPLAY_OPTIONS, EdgeDisplayOptions } from "./edge";
import Graph, {
  DEFAULT_GRAPH,
  DEFAULT_GRAPH_OPTIONS,
  GraphOptions,
  GraphType,
} from "./graph";
import GraphNode from "./node";
import { hasMultipleEdges } from "./parsers";
import Queue from "./queue";

const EPSILON = 0.0001;

// Internal representation of graph will always be adjacency list
let graph: Graph = Graph.parseGraph(
  DEFAULT_GRAPH,
  DEFAULT_GRAPH_OPTIONS
) as Graph;
console.log(graph);

console.log(
  hasMultipleEdges(
    (Graph.parseGraph(DEFAULT_GRAPH, DEFAULT_GRAPH_OPTIONS) as Graph).adjlist
  )
);

// The stuff to be drawn
// Nodes are graph nodes and are just circles
// Its stored in a Map (similar to c++ map)
// Where the key is the idx of the node
let nodes: Map<number, GraphNode> = new Map();
// Springs control the spring forces between the nodes
let springs: Edge[] = [];

// Queue of stuff for the update() method to handle
const queue: Queue<(p: p5) => void> = new Queue();

let currentlyDraggedNode: GraphNode | null = null;

// The actual p5 instance that draws stuff
new p5((p: p5) => {
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);

    // Create nodes based on graph representation
    updateNodes(p);

    // Create springs (dfs)
    updateSprings();
  };

  p.draw = () => {
    p.background(0);

    // HANDLE EVENTS
    let task = queue.pop();
    while (task) {
      task(p);
      task = queue.pop();
    }

    // REPULSION OF NODES
    // For every node...
    for (const [, node] of nodes) {
      const steering = p.createVector();
      let total = 0;
      // You visit every other node
      for (const [, other] of nodes) {
        let d = p.dist(node.pos.x, node.pos.y, other.pos.x, other.pos.y);
        // If the other node is not your own
        // And if the other node is within your perception radius
        if (d <= 0) d = EPSILON;
        if (other != this && d < GraphNode.PERCEPTION_RADIUS) {
          // You add a force pointing from the other's position to the your position
          const diff = p5.Vector.sub(node.pos, other.pos);
          diff.div(d * d);
          steering.add(diff);
          total++;
        }
      }
      if (total > 0) {
        // We divide by the total to find the average
        steering.div(total);
        // We set its magnitude to the max speed
        // So it always moves at that speed
        steering.setMag(GraphNode.MAX_SPEED);
        // Subtract the direction from the velocity
        // to get the steering
        steering.sub(node.vel);
        // We limit the force so it doesn't go too crazy
        steering.limit(GraphNode.MAX_FORCE);
      }
      // We actually apply that force
      node.applyForce(steering);
    }

    // Attracted to center
    for (const [, node] of nodes) {
      node.applyForce(
        // You get a vector pointing from your position to the center
        p5.Vector.sub(p.createVector(p.width / 2, p.height / 2), node.pos)
          // Set its speed (like above)
          .setMag(GraphNode.MAX_SPEED)
          // Subtract to get the steering (like above)
          .sub(node.vel)
          // Limit the force (like above)
          .limit(GraphNode.MAX_FORCE * 0.7)
      );
    }

    // Force the nodes to be inside the screen
    // Basically we just clamp the position inside the screen lol
    for (const [, node] of nodes) {
      node.pos.set(
        clamp(node.pos.x, GraphNode.SIZE, p.width - GraphNode.SIZE),
        clamp(node.pos.y, GraphNode.SIZE, p.height - GraphNode.SIZE)
      );
    }

    // Draw the edges
    {
      for (const [from, x] of graph.adjlist) {
        for (const y of x) {
          const to = y.first;
          const weight = y.second;

          const options: EdgeDisplayOptions = vm.$data.edgeDisplayOptions;

          // console.log(`options.showThickness: ${options.showThickness}`);
          // console.log(`options.thickness: ${options.thickness}`);

          const strokeWeight = p.map(
            weight,
            graph.minWeight,
            graph.maxWeight,
            2,
            10
          );

          const a = nodes.get(from)!;
          const b = nodes.get(to)!;
          const left = a.pos.x < b.pos.x ? a : b;
          const right = a.pos.x < b.pos.x ? b : a;

          const fromAtoB = graph.adjlist
            .get(a.id)
            ?.map((v) => v.first)
            .includes(b.id);
          const fromBtoA = graph.adjlist
            .get(b.id)
            ?.map((v) => v.first)
            .includes(a.id);
          const shouldDrawArrow = fromAtoB != fromBtoA;

          const strokeToDraw = options.showThickness
            ? strokeWeight
            : options.thickness;

          const v = p5.Vector.sub(right.pos, left.pos);
          v.div(2);

          p.noStroke();
          p.fill(255);

          // Draw text
          p.push();
          p.translate(left.pos);
          p.rotate(v.heading());
          p.text(`${weight}`, v.mag(), 15 + strokeToDraw / 2);
          p.pop();

          // Draw arrow / line
          const aToB = p5.Vector.sub(b.pos, a.pos);
          const arrowSize = 25;
          const lineLength = aToB.mag() - arrowSize - GraphNode.SIZE / 2;

          p.push();
          p.translate(a.pos);
          p.strokeWeight(strokeToDraw);
          p.stroke(255);
          p.rotate(aToB.heading());
          p.line(0, 0, /* shouldDrawArrow ? lineLength : */ aToB.mag(), 0);
          p.noStroke();
          if (shouldDrawArrow) {
            p.translate(lineLength + strokeWeight / 2, 0);
            p.triangle(0, arrowSize / 2, 0, -arrowSize / 2, arrowSize, 0);
          }
          p.pop();
        }
      }
    }

    // Update all springs
    for (const spring of springs) {
      spring.update();
      // spring.show(p);
    }

    // Update and draw all nodes
    for (const [, node] of nodes) {
      if (node != currentlyDraggedNode) node.update();
      node.show(p);
    }

    // Draggable nodes
    currentlyDraggedNode?.pos.set(p.mouseX, p.mouseY);
    currentlyDraggedNode?.vel.set(0, 0);
    currentlyDraggedNode?.acc.set(0, 0);

    let hovering = false;
    for (const [, node] of nodes) {
      if (
        p.dist(p.mouseX, p.mouseY, node.pos.x, node.pos.y) <
        GraphNode.SIZE / 2
      ) {
        document.body.style.cursor = "grab";
        hovering = true;
      }
    }
    if (!hovering) {
      document.body.style.cursor = "default";
    }
  };

  p.mouseDragged = () => {
    for (const [, node] of nodes) {
      if (
        p.dist(p.mouseX, p.mouseY, node.pos.x, node.pos.y) <
        GraphNode.SIZE / 2
      ) {
        currentlyDraggedNode = node;
        return;
      }
    }
  };

  p.mouseReleased = () => {
    currentlyDraggedNode = null;
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  // for debugging
  if (process.env.NODE_ENV == "development") {
    p.keyPressed = () => {
      if (p.key == "x") {
        console.log(graph);
      }
    };
  }
});

interface VueData {
  graphText: string;
  graphOptions: GraphOptions;
  edgeDisplayOptions: EdgeDisplayOptions;
  prevEdgeDisplayOptions: EdgeDisplayOptions;
  proxyStartingIndex: string;
  graphHelp: string;
  graphOptionsIsHidden: boolean;
  isUnweighted: boolean;
  displayIsHidden: boolean;
  link: string;
  debouncedUpdateGraph: () => void;
}

const vm = new Vue<
  VueData,
  {
    updateGraph(): void;
    toggleHidden(): void;
    toggleDisplayHidden(): void;
    changeHiddenMessage(): void;
  },
  // eslint-disable-next-line @typescript-eslint/ban-types
  object,
  never
>({
  el: "#vue-app",
  data() {
    return {
      graphText: DEFAULT_GRAPH,
      graphOptions: DEFAULT_GRAPH_OPTIONS,
      edgeDisplayOptions: DEFAULT_EDGE_DISPLAY_OPTIONS,
      prevEdgeDisplayOptions: DEFAULT_EDGE_DISPLAY_OPTIONS,
      proxyStartingIndex: "1",
      graphHelp:
        "Format: For every line of input [a] [b] [c],  there is a edge connecting node a to node b with weight c. For more info, visit: https://github.com/AJR07/Graph-Visualiser#2-edge-list",
      isUnweighted: false,
      graphOptionsIsHidden: false,
      displayIsHidden: false,
      link: "https://github.com/AJR07/Graph-Visualiser#2-edge-list",
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      debouncedUpdateGraph: () => {},
    };
  },
  watch: {
    proxyStartingIndex(newValue: string) {
      this.graphOptions.startingIndex = parseInt(newValue, 10);
    },
    edgeDisplayOptions: {
      handler: function (newValue: EdgeDisplayOptions) {
        const prevValue = this.prevEdgeDisplayOptions;

        if (newValue.length != prevValue.length) {
          console.log("using debounced");
          this.debouncedUpdateGraph();
        } else {
          if (newValue.thickness == prevValue.thickness) {
            console.log("using normal");
            this.updateGraph();
          }
        }

        this.prevEdgeDisplayOptions = JSON.parse(JSON.stringify(newValue));
      },
      deep: true,
    },
  },
  created() {
    this.debouncedUpdateGraph = debounce(this.updateGraph, 500);
  },
  methods: {
    updateGraph() {
      console.log("Updating graph");

      queue.push((p: p5) => {
        const tmp = Graph.parseGraph(this.graphText, this.graphOptions);

        if (!(tmp instanceof Graph)) {
          alert(tmp);
          return;
        }

        this.isUnweighted = Graph.isUnweightedGraph(tmp.adjlist);

        if (this.isUnweighted) {
          this.edgeDisplayOptions.showThickness = false;
          this.edgeDisplayOptions.showLength = false;
        }

        graph = tmp;
        updateNodes(p);
        updateSprings();

        // Length
        if (!this.edgeDisplayOptions.showLength) {
          for (const spring of springs) {
            spring.restLength = this.edgeDisplayOptions.length;
          }
        } else {
          for (const spring of springs) {
            let weight: number | null = null;

            for (const edgePair of Graph.adjlistToEdgelist(graph.adjlist)) {
              if (
                (edgePair[0] == spring.a.id && edgePair[1] == spring.b.id) ||
                (edgePair[1] == spring.a.id && edgePair[0] == spring.b.id)
              ) {
                weight = edgePair[2];
                break;
              }
            }

            if (!weight) {
              console.error("Weight is null");
              continue;
            }

            spring.restLength = p.map(
              weight,
              graph.minWeight,
              graph.maxWeight,
              100,
              500
            );
          }
        }
      });
      this.changeHiddenMessage();
    },
    toggleHidden() {
      this.graphOptionsIsHidden = !this.graphOptionsIsHidden;
    },
    toggleDisplayHidden() {
      this.displayIsHidden = !this.displayIsHidden;
    },
    changeHiddenMessage() {
      //changing help message based on the user configuration
      this.graphHelp = "";
      if (this.graphOptions.type == GraphType.EdgeList) {
        //edge list
        if (this.graphOptions.weighted)
          this.graphHelp +=
            "Format: For every line of input [a] [b] [c],  there is a edge connecting node a to node b with weight c.";
        else
          this.graphHelp +=
            "Format: For every line of input [a] [b], there is a edge connecting node a to node b with weight default to 1";

        this.link = "https://github.com/AJR07/Graph-Visualiser#2-edge-list";
      } else if (this.graphOptions.type == GraphType.AdjList) {
        //adjacency list
        this.graphHelp += "The bidirectional option does not apply here";
        if (this.graphOptions.weighted)
          this.graphHelp +=
            "Format: ith line contains [n1] [w1] [n2] [w2] ..., where n is the node its connected to and w is the weight";
        else
          this.graphHelp +=
            "Format: ith line contains all the nodes i is connected to";

        this.link =
          "https://github.com/AJR07/Graph-Visualiser#1-adjacency-list";
      } else {
        //adjacency matrix
        this.graphHelp +=
          "Format: For every ith line, the nth number in that line (space separated) means there is a edge connecting node i to node n. If the graph is weighted, then the weight of the edge connecting node i to node n is the nth number at the ith row.";
        this.graphHelp +=
          "Both the bidirectional and the weighted options doesn't apply here. If the graph is bidirectional, the matrix should be symmetrical, if the graph is not weighted, all edges that are connected should have a weight of 1";
        this.link =
          "https://github.com/AJR07/Graph-Visualiser#3-adjacency-matrix";
      }
    },
  },
});

function updateNodes(p: p5) {
  nodes = new Map();

  for (const [key] of graph.adjlist) {
    nodes.set(
      key,
      new GraphNode(p, key, p.random(p.width), p.random(p.height))
    );
  }
}

function updateSprings() {
  springs = [];

  for (const edge of Graph.adjlistToEdgelist(graph.adjlist)) {
    springs.push(new Edge(0.01, nodes.get(edge[0])!, nodes.get(edge[1])!));
  }
}
