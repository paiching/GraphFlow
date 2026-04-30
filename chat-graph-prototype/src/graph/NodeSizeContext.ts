import { createContext } from "react";

export const NODE_SIZE_KEY = "graph-node-size";
export const DEFAULT_NODE_SIZE = 148;

export const NodeSizeContext = createContext(DEFAULT_NODE_SIZE);
