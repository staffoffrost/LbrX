import { getOwnPropertyNames } from '../short-hand-functions'
import { isDate } from './is-date'
import { isObject } from './is-object'
import { throwError } from './throw-error'

function dateThrow(this: Date): never {
  throwError(`This date: "${this.toLocaleString()}" is read only.`)
}

export function deepFreeze<T extends object>(object: T): Readonly<T> {
  for (const key of getOwnPropertyNames(object)) {
    const value = object[key]
    if (isDate(value)) {
      value.setTime = dateThrow
      value.setFullYear = dateThrow
      value.setMonth = dateThrow
      value.setDate = dateThrow
      value.setHours = dateThrow
      value.setMinutes = dateThrow
      value.setMilliseconds = dateThrow
      value.setUTCFullYear = dateThrow
      value.setUTCMonth = dateThrow
      value.setUTCDate = dateThrow
      value.setUTCHours = dateThrow
      value.setUTCMinutes = dateThrow
      value.setUTCMilliseconds = dateThrow
    } else if (isObject(value)) {
      object[key] = deepFreeze(value)
    }
  }
  return Object.freeze(object)
}
