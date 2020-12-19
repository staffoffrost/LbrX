import { assert, isNumber, isString, throwError } from '../helpers'
import { BaseStore } from './base-store'
import { ListStoreConfigCompleteInfo, ListStoreConfigOptions } from './config'


export class ListStore<T extends object, E = any> extends BaseStore<T[], T, E> {

  //#region state

  /** @internal */
  protected readonly _map: Map<any, T> = new Map()

  //#region state
  //#endregion config

  protected readonly _config!: ListStoreConfigCompleteInfo<T>

  /**
   * @get Returns store's configuration.
   */
  public get config(): ListStoreConfigCompleteInfo<T> {
    return this._config
  }

  /** @internal */
  protected readonly _idKey: keyof T | null

  //#endregion config
  //#region constructor

  /**
   * Synchronous initialization.
   */
  constructor(initialValue: T[], storeConfig?: ListStoreConfigOptions<T>)
  /**
   * Asynchronous or delayed initialization.
   * The store will be set into loading state till initialization.
   */
  constructor(initialValue: null, storeConfig?: ListStoreConfigOptions<T>)
  /**
   * Dynamic initialization.
   */
  constructor(initialValue: T[] | null, storeConfig?: ListStoreConfigOptions<T>)
  constructor(initialValueOrNull: T[] | null, storeConfig?: ListStoreConfigOptions<T>) {
    super(storeConfig)
    const config = this._config
    this._idKey = config.idKey = config.idKey || null
    this._preInit(initialValueOrNull)
  }

  //#endregion constructor
  //#region helper-methods

  /** @internal */
  protected _assertValidId(value: any): void {
    if (this._map.has(value)) {
      throwError(`Store: "${this._config.name}" has been provided with duplicate id keys. Duplicate key: ${value}.`)
    } else if (!isString(value) && !isNumber(value)) {
      throwError(`Store: "${this._config.name}" has been provided with key that is not a string and nor a number.`)
    }
  }

  //#endregion helper-methods
  //#region initialization-methods

  /** @internal */
  protected _initializeStore(initialValue: T[], isAsync: boolean): void {
    super._initializeStore(initialValue, isAsync)
    const value = this._value
    assert(value, `Store: "${this._config.name}" could not be initialized with the given initial value.`)
    this._setMap(value)
  }

  //#endregion initialization-methods
  //#region state-methods

  /** @internal */
  protected _setMap(value: T[] | Readonly<T[]>): void {
    const idKey = this._idKey
    if (!idKey) return
    value.forEach(x => {
      this._assertValidId(x[idKey])
      this._map.set(x[idKey], x)
    })
  }

  //#endregion state-methods
}
