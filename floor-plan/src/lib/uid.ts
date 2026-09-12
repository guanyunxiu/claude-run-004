/** 简易唯一 id */
let counter = 0

export function uid(prefix = 'el'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}
