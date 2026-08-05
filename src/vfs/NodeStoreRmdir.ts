import { AbsolutePath } from '../core/AbsolutePath'
import { FSNode } from './FSNode'

type ParentLookup = (path: AbsolutePath) => { parent: FSNode, name: string }

export class NodeStoreRmdir {
  constructor(private readonly assertWritable: (path: AbsolutePath) => void, private readonly parentOf: ParentLookup) {}

  run(path: AbsolutePath) {
    this.assertWritable(path); const { parent, name } = this.parentOf(path)
    this.removeEmptyDir(parent, name, path)
  }

  private removeEmptyDir(parent: FSNode, name: string, path: AbsolutePath) {
    const index = parent.children?.findIndex(child => child.name === name) ?? -1
    if (index < 0) throw new Error(`No such file: ${path}`); this.assertEmptyDir(parent.children![index], path)
    parent.children!.splice(index, 1)
  }

  private assertEmptyDir(node: FSNode, path: AbsolutePath) {
    if (!node.dir) throw new Error(`Not a directory: ${path}`)
    if (node.children?.length) throw new Error(`Directory not empty: ${path}`)
  }
}
