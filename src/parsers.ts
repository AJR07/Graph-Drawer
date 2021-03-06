import Graph, { AdjList, GraphOptions, GraphType } from "./graph";
import Pair from "./pair";

type GraphParser = (str: string, options: GraphOptions) => Graph | string;

function isNumber(s: string): boolean {
  return /^[0-9]+$/.test(s);
}

export function hasSelfLoops(adjlist: AdjList): boolean {
  for (const [node, edges] of adjlist) {
    if (edges.map((v) => v.first).includes(node)) return true;
  }

  return false;
}

export function hasMultipleEdges(adjlist: AdjList): boolean {
  console.log(adjlist);
  for (const [, edges] of adjlist) {
    if (new Set(edges.map((v) => v.first)).size != edges.length) return true;
  }

  return false;
}

enum ParserErrMsg {
  Default = "Invalid graph",
  EmptyString = "Graph cannot be empty",
  NotANumber = "There's something that isn't a number",
  NegativeNodes = "The node number/id cannot be negative",
  HasSelfLoops = "Sorry, self loops aren't supported yet",
  HasMultipleEdges = "Sorry, multiple edges aren't supported yet",
}

function adjlistParser(str: string, options: GraphOptions): Graph | string {
  if (str.trim().length == 0) return ParserErrMsg.EmptyString;

  const adjlist: AdjList = new Map();
  for (const [idx, line] of str.split("\n").entries()) {
    const from = idx + options.startingIndex;

    if (from < 0) return ParserErrMsg.NegativeNodes;

    adjlist.set(from, []);

    if (options.weighted) {
      const spaceSeparated = line.split(" ");
      if (spaceSeparated.length % 2 != 0) return ParserErrMsg.Default;

      for (let i = 0; i < spaceSeparated.length - 1; i += 2) {
        if (!(isNumber(spaceSeparated[i]) && isNumber(spaceSeparated[i + 1])))
          return ParserErrMsg.NotANumber;

        const to = parseInt(spaceSeparated[i], 10);
        const weight = parseInt(spaceSeparated[i + 1], 10);

        if (isNaN(to) || isNaN(weight)) return ParserErrMsg.NotANumber;
        if (to < 0) return ParserErrMsg.NegativeNodes;

        if (!adjlist.get(to)) adjlist.set(to, []);
        adjlist.get(from)?.push(new Pair(to, weight));
      }
    } else {
      for (const toS of line.split(" ")) {
        if (!isNumber(toS)) return ParserErrMsg.NotANumber;

        const to = parseInt(toS, 10);

        if (isNaN(to)) return ParserErrMsg.NotANumber;
        if (to < 0) return ParserErrMsg.NegativeNodes;

        if (!adjlist.get(to)) adjlist.set(to, []);
        adjlist.get(from)?.push(new Pair(to, 1));
      }
    }
  }
  console.log("adjlist parser result", adjlist);

  if (hasMultipleEdges(adjlist)) return ParserErrMsg.HasMultipleEdges;
  if (hasSelfLoops(adjlist)) return ParserErrMsg.HasSelfLoops;

  return new Graph(adjlist, options);
}

function adjMatrixParser(str: string, options: GraphOptions): Graph | string {
  if (str.trim().length == 0) return ParserErrMsg.EmptyString;

  const adjlist: AdjList = new Map();

  for (const [i, line] of str.split("\n").entries()) {
    for (const [j, numS] of line.trim().split(" ").entries()) {
      if (i < 0 || j < 0) return ParserErrMsg.NegativeNodes;

      const from = i + options.startingIndex;
      const to = j + options.startingIndex;

      if (from < 0 || to < 0) return ParserErrMsg.NegativeNodes;

      if (!adjlist.get(from)) adjlist.set(from, []);
      if (!adjlist.get(to)) adjlist.set(to, []);

      if (!isNumber(numS)) return ParserErrMsg.NotANumber;
      const n = parseInt(numS.trim(), 10);

      if (n == 0) continue;

      if (isNaN(n)) return ParserErrMsg.NotANumber;

      adjlist.get(from)?.push(new Pair(to, n));
    }
  }

  if (hasMultipleEdges(adjlist)) return ParserErrMsg.HasMultipleEdges;
  if (hasSelfLoops(adjlist)) return ParserErrMsg.HasSelfLoops;

  return new Graph(adjlist, options);
}

function edgeListParser(str: string, options: GraphOptions): Graph | string {
  if (str.trim().length == 0) return ParserErrMsg.EmptyString;

  const adjlist: AdjList = new Map();
  for (const line of str.split("\n")) {
    // A, B and weight as string
    const [aS, bS, wS, ...remaining] = line.split(" ");

    if (!options.weighted && wS) return ParserErrMsg.Default;

    if (remaining.length > 0) return "Found extraneous numbers";
    if (!(isNumber(aS) && isNumber(bS))) return ParserErrMsg.NotANumber;
    if (options.weighted && !isNumber(wS)) return ParserErrMsg.NotANumber;

    // We parse the string into int
    const a = parseInt(aS, 10);
    const b = parseInt(bS, 10);
    const w = options.weighted ? parseInt(wS, 10) : 1; // if its unweighted, the weight will default to 1

    if (isNaN(a) || isNaN(b) || isNaN(w)) return ParserErrMsg.NotANumber;
    if (a < 0 || b < 0) return ParserErrMsg.NegativeNodes;

    // If the node doesn't exist yet, create a empty array there
    if (!adjlist.has(a)) adjlist.set(a, []);
    // Do the same for all referenced nodes
    if (!adjlist.has(b)) adjlist.set(b, []);
    // We push the new node + weight into the adjacency list
    adjlist.get(a)?.push(new Pair(b, w));

    // we do the same for the opposite if its bidirectional
    if (options.bidirectional) {
      if (!adjlist.has(b)) adjlist.set(b, []);

      adjlist.get(b)?.push(new Pair(a, w));
    }
  }

  if (hasMultipleEdges(adjlist)) return ParserErrMsg.HasMultipleEdges;
  if (hasSelfLoops(adjlist)) return ParserErrMsg.HasSelfLoops;

  return new Graph(adjlist, options);
}

const PARSERS: { [k in GraphType]: GraphParser } = {
  AdjList: adjlistParser,
  AdjMatrix: adjMatrixParser,
  EdgeList: edgeListParser,
};

export default PARSERS;
