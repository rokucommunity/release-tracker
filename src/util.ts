export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createClassFactory(classes: string[]) {
  let map = new Map<string, string>();
  return function (key: string) {
    if (map.has(key)) {
      return map.get(key);
    }
    let result = classes[map.size % classes.length];
    map.set(key, result);
    return result;
  }
}
