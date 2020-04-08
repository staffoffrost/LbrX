import { parse, stringify } from 'lbrx/helpers'
import { GlobalStoreConfigOptions } from './global-store-config-options'
import { ObjectCompareTypes } from './object-compare-types.enum'
import { Storages } from './storages.enum'

const defaultStoreOptions: Required<GlobalStoreConfigOptions> = {
  isResettable: true,
  storageType: Storages.none,
  storageDebounceTime: 2000,
  customStorageApi: null,
  objectCompareType: ObjectCompareTypes.advanced,
  isSimpleCloning: false,
  stringify,
  parse,
}

export function getDefaultStoreOptions(): GlobalStoreConfigOptions {
  return defaultStoreOptions
}
