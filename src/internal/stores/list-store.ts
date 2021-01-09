import { isDev, isStackTracingErrors, SortFactory } from '../core'
import { assert, isArray, isBool, isCalledBy, isFunction, isNull, isNumber, isString, isUndefined, logError, objectAssign, objectFreeze } from '../helpers'
import { KeyValue } from '../types'
import { SortMethod } from '../types/sort-method'
import { ListStoreConfigCompleteInfo, ListStoreConfigOptions } from './config'
import { QueryableListStoreAdapter } from './queryable-list-store-adapter'
import { Actions, Predicate, SetStateParam, State } from './store-accessories'


export class ListStore<S extends object, Id extends string | number | symbol = string, E = any> extends QueryableListStoreAdapter<S, E> {

  //#region state

  /** @internal */
  protected _keyIndexMap: KeyValue<string | number | symbol, number> | null = null

  /** @internal */
  protected get _state(): State<S[], E> {
    return objectAssign({}, this._stateSource)
  }
  protected set _state(value: State<S[], E>) {
    if (isStackTracingErrors() && isDev() && !isCalledBy(`_setState`, 0)) {
      logError(`Store: "${this._storeName}" has called "_state" setter not from "_setState" method.`)
    }
    if (value.value) {
      value.value = this._sortHandler(value.value) // TODO: better sort logic if possible
      const list: readonly S[] = value.value
      const idKey = this._idKey
      if (idKey) {
        this._keyIndexMap = {}
        const set = new Set<string | number | symbol>()
        // tslint:disable-next-line: prefer-for-of
        for (let i = 0; i < value.value.length; i++) {
          const id: Id = list[i][idKey] as any
          this._keyIndexMap[id] = i
          set.add(id)
        }
        this._assertUniqueIds(value.value, set)
      }
    }
    this._stateSource = value
    this._distributeState(value)
  }

  //#region state
  //#endregion config

  protected readonly _config!: ListStoreConfigCompleteInfo<S>

  /**
   * @get Returns store's configuration.
   */
  public get config(): ListStoreConfigCompleteInfo<S> {
    return this._config
  }

  /** @internal */
  protected readonly _idKey: keyof S | null

  /** @internal */
  protected readonly _sort: SortMethod<S> | null

  //#endregion config
  //#region constructor

  /**
   * Synchronous initialization.
   */
  constructor(initialValue: S[], storeConfig?: ListStoreConfigOptions<S>)
  /**
   * Asynchronous or delayed initialization.
   * The store will be set into loading state till initialization.
   */
  constructor(initialValue: null, storeConfig?: ListStoreConfigOptions<S>)
  /**
   * Dynamic initialization.
   */
  constructor(initialValue: S[] | null, storeConfig?: ListStoreConfigOptions<S>)
  constructor(initialValueOrNull: S[] | null, storeConfig?: ListStoreConfigOptions<S>) {
    super(storeConfig)
    const config = this._config
    this._idKey = config.idKey = config.idKey || null
    this._sort = config.orderBy ?
      isFunction(config.orderBy) ?
        config.orderBy :
        SortFactory.create(config.orderBy) :
      null
    this._preInit(initialValueOrNull)
  }

  //#endregion constructor
  //#region helper-methods

  /** @internal */
  protected _noSort(value: S[]): S[] {
    return value
  }

  /** @internal */
  protected _sortHandler(value: readonly S[]): readonly S[] {
    if (isNull(this._sort)) return value
    value = this._sort(isDev() ? [...value] : value as S[])
    return isDev() ? objectFreeze(value) : value
  }

  /** @internal */
  protected _assertUniqueIds(value: S[] | readonly S[], set: Set<string | number | symbol>): boolean | never {
    assert(value.length == set.size, `Store: "${this._storeName}" has received a duplicate key.`)
    return true
  }
  //#endregion helper-methods
  //#region state-methods

  /** @internal */
  protected _setState({
    valueFnOrState,
    actionName,
    stateExtension,
    doSkipClone,
    doSkipFreeze,
  }: SetStateParam<S[] | readonly S[], E>): void {
    super._setState({
      valueFnOrState,
      actionName,
      stateExtension,
      doSkipClone: isUndefined(doSkipClone) ? false : doSkipClone,
      doSkipFreeze: isUndefined(doSkipFreeze) ? false : doSkipFreeze,
    })
  }

  //#endregion state-methods
  //#region delete-methods

  public remove(predicate: Predicate<S>, actionName?: string): boolean {
    const value: readonly S[] | null = this._value
    if (!value || this.isPaused) return false
    const newValue: S[] = []
    let isItemNotFound = true
    value.forEach((x, i, a) => {
      let doSkipItem = false
      if (isItemNotFound) doSkipItem = predicate(x, i, a)
      if (doSkipItem) isItemNotFound = false
      else newValue.push(x)
    })
    if (!isItemNotFound) {
      this._setState({
        valueFnOrState: { value: this._freezeHandler(newValue, true) },
        actionName: actionName || Actions.removeRange,
        doSkipFreeze: true,
        doSkipClone: true,
      })
    }
    return !isItemNotFound
  }

  public removeRange(predicate: Predicate<S>, actionName?: string): number {
    const value: readonly S[] | null = this._value
    if (!value || this.isPaused) return 0
    const newValue: S[] = []
    let itemsRemoved = 0
    value.forEach((x, i, a) => {
      const doSkipItem = predicate(x, i, a)
      if (doSkipItem) itemsRemoved++
      else newValue.push(x)
    })
    if (itemsRemoved) {
      this._setState({
        valueFnOrState: { value: this._freezeHandler(newValue, true) },
        actionName: actionName || Actions.removeRange,
        doSkipFreeze: true,
        doSkipClone: true,
      })
    }
    return itemsRemoved
  }

  public delete(id: Id, actionName?: string): boolean
  public delete(ids: Id[], actionName?: string): number
  public delete(idOrIds: Id | Id[], actionName?: string): boolean | number {
    const isArr = isArray(idOrIds)
    if (!isArr) idOrIds = [idOrIds] as Id[]
    const idKey = this._idKey
    const value: readonly S[] | null = this._value
    if (!idKey || !value || this.isPaused) return isArr ? 0 : false
    const filteredValue = value.filter(x => !(idOrIds as Id[]).includes(x[idKey] as any))
    const deletedCount = value.length - filteredValue.length
    if (deletedCount) {
      this._setState({
        valueFnOrState: { value: this._freezeHandler(filteredValue, true) },
        actionName: actionName || Actions.delete,
        doSkipFreeze: true,
        doSkipClone: true,
      })
    }
    return isArr ? deletedCount : false
  }

  public clear(actionName?: string): boolean {
    if (this.isPaused) return false
    const countOrNull: number | null = this._value ? this._value.length : null
    if (countOrNull) {
      this._setState({
        valueFnOrState: { value: this._freeze([]) },
        actionName: actionName || Actions.removeRange,
        doSkipFreeze: true,
        doSkipClone: true,
      })
    }
    return !!countOrNull
  }

  //#endregion delete-methods
  //#region add-or-update-methods

  public add(item: S, actionName?: string): void
  public add(items: S[], actionName?: string): void
  public add(itemOrItems: S | S[], actionName?: string): void {
    if (this.isPaused) return
    const value: Readonly<S>[] = [...this._assertValue]
    assert(this.isInitialized, `Store: "${this._storeName}" can't add items to store before it was initialized.`)
    const clonedItemOrItems = this._cloneAndFreeze(itemOrItems)
    if (isArray(clonedItemOrItems)) {
      if (!clonedItemOrItems.length) return
      clonedItemOrItems.forEach(x => {
        value.push(x)
      })
    } else {
      value.push(clonedItemOrItems as Readonly<S>)
    }
    this._setState({
      valueFnOrState: { value: this._freezeHandler(value, true) },
      actionName: actionName || Actions.add,
      doSkipFreeze: true,
      doSkipClone: true,
    })
  }

  public set(items: S[], actionName?: string): void {
    if (this.isPaused) return
    assert(this.isInitialized, `Store: "${this._storeName}" can't set items to store before it was initialized.`)
    this._setState({
      valueFnOrState: { value: items },
      actionName: actionName || Actions.set,
    })
  }

  public update(id: Id, value: Partial<S>, actionName?: string): boolean
  public update(id: Id, value: S, isOverride: true, actionName?: string): boolean
  public update(ids: Id[], value: Partial<S>, actionName?: string): number
  public update(ids: Id[], value: S, isOverride: true, actionName?: string): number
  public update(predicate: Predicate<S>, value: Partial<S>, actionName?: string): number
  public update(predicate: Predicate<S>, value: S, isOverride: true, actionName?: string): number
  public update(
    idOrIdsOrPredicate: Id | Id[] | Predicate<S>,
    value: Partial<S> | S,
    isOverrideOrActionName?: boolean | string,
    actionName?: string
  ): boolean | number {
    const isSingleId = !isArray(idOrIdsOrPredicate) && !isFunction(idOrIdsOrPredicate)
    if (this.isPaused) return isSingleId ? 0 : false
    assert(this.isInitialized, `Store: "${this._storeName}" can't update items before it was initialized.`)
    const isOverride: boolean = isBool(isOverrideOrActionName) ? isOverrideOrActionName : false
    actionName = isString(isOverrideOrActionName) ? isOverrideOrActionName : actionName || Actions.update
    const oldValue: readonly S[] = this._assertValue
    let newValue: Readonly<S>[] = []
    let updateCounter = 0
    const update = (item: Readonly<S>, newItem: S | Partial<S>): Readonly<S> => {
      if (!isOverride) newItem = this._merge(this._clone(item), newItem)
      return this._cloneAndFreeze(newItem) as Readonly<S>
    }
    const updateByKey = (key: Id, keyIdMap: KeyValue<string | number | symbol, number>): void => {
      const index: number | void = keyIdMap[key]
      if (isNumber(index)) {
        newValue[index] = update(oldValue[index], value)
        updateCounter++
      }
    }
    if (isFunction(idOrIdsOrPredicate)) {
      oldValue.forEach((x, i, a) => {
        if (idOrIdsOrPredicate(x, i, a)) {
          x = update(x, value)
          updateCounter++
        }
        newValue.push(x)
      })
    } else if (!this._keyIndexMap) {
    } else if (isArray(idOrIdsOrPredicate)) {
      newValue = [...oldValue]
      idOrIdsOrPredicate.forEach(x => {
        updateByKey(x, this._keyIndexMap!)
      })
    } else {
      newValue = [...oldValue]
      updateByKey(idOrIdsOrPredicate, this._keyIndexMap)
    }
    this._setState({
      valueFnOrState: { value: this._freezeHandler(newValue, true) },
      actionName,
      doSkipFreeze: true,
      doSkipClone: true,
    })
    return isSingleId ? !!updateCounter : updateCounter
  }

  //#endregion add-or-update-methods
  //#region query-methods

  public has(id: Id): boolean {
    return this._keyIndexMap ? isNumber(this._keyIndexMap[id]) : false
  }

  //#endregion query-methods
}
