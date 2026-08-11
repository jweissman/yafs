import Yafs from "../../src";

export async function workspace() {
  const yafs = new Yafs();
  await yafs.executeAsync("mkdir work");
  await yafs.executeAsync("echo a > work/a.md");
  await yafs.executeAsync("mkdir work/nested");
  await yafs.executeAsync("echo b > work/nested/b.md");
  await yafs.executeAsync("ln -s b.md work/nested/latest");
  return yafs;
}
