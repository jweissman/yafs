import { Clock } from '../core/Clock'
import { NodeStoreInspection } from './NodeStoreInspection'
import { NodeStoreMutation } from './NodeStoreMutation'
import { NodeStoreResolver } from './NodeStoreResolver'
import { NodeStoreSnapshot } from './NodeStoreSnapshot'
import { NodeStoreState } from './NodeStoreState'

export type NodeStoreComponents = {
  state: NodeStoreState, resolver: NodeStoreResolver, mutation: NodeStoreMutation,
  inspection: NodeStoreInspection, snapshots: NodeStoreSnapshot
}

export function createNodeStoreComponents(clock: Clock): NodeStoreComponents {
  const state = new NodeStoreState(clock); const resolver = new NodeStoreResolver(state)
  return compose(state, resolver, clock)
}

function compose(state: NodeStoreState, resolver: NodeStoreResolver, clock: Clock): NodeStoreComponents {
  const mutation = new NodeStoreMutation(state, resolver)
  return { state, resolver, mutation, inspection: new NodeStoreInspection(state, resolver),
    snapshots: snapshots(state, resolver, mutation, clock) }
}

function snapshots(state: NodeStoreState, resolver: NodeStoreResolver, mutation: NodeStoreMutation, clock: Clock) {
  return new NodeStoreSnapshot(state, resolver, mutation, () => createNodeStoreComponents(clock).snapshots)
}
