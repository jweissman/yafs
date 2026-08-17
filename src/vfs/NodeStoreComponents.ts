import { Clock } from "../core/Clock";
import { NodeStoreInspection } from "./NodeStoreInspection";
import { NodeStoreMutation } from "./NodeStoreMutation";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreSnapshot } from "./NodeStoreSnapshot";
import { NodeStoreState } from "./NodeStoreState";

export interface NodeStoreComponents {
  state: NodeStoreState;
  resolver: NodeStoreResolver;
  mutation: NodeStoreMutation;
  inspection: NodeStoreInspection;
  snapshots: NodeStoreSnapshot;
}

export function createNodeStoreComponents(clock: Clock): NodeStoreComponents {
  const state = new NodeStoreState(clock);
  const resolver = new NodeStoreResolver(state);
  return components(state, resolver);
}

function components(
  state: NodeStoreState,
  resolver: NodeStoreResolver,
): NodeStoreComponents {
  const mutation = new NodeStoreMutation(state, resolver);
  const inspection = new NodeStoreInspection(state, resolver);
  const snapshots = new NodeStoreSnapshot(state, mutation);
  return { state, resolver, mutation, inspection, snapshots };
}
