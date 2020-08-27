import { BehaviorSubject, isObservable, Observable, Subject, Subscription } from 'rxjs'
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'
import { isDev, isStackTracingErrors } from '../core'
import { DevToolsAdapter, isDevTools } from '../dev-tools'
import { assert, cloneError, cloneObject, compareObjects, deepFreeze, getPromiseState, instanceHandler, isCalledBy, isError, isFunction, isNull, isObject, isUndefined, logError, logWarn, mergeObjects, newError, objectAssign, PromiseStates, simpleCloneObject, simpleCompareObjects, throwError } from '../helpers'
import { Class } from '../types'
import { ObjectCompareTypes, Storages, StoreConfig, StoreConfigInfo, StoreConfigOptions, STORE_CONFIG_KEY } from './config'
import { Actions, Clone, Compare, createPromiseScope, Freeze, getDefaultState, Parse, PromiseScope, QueryScope, State, Stringify } from './store-accessories'
import { StoreTags } from './store-accessories/store-related/store-tags.enum'

export abstract class BaseStore<T extends object, E = any> {

  //#region static

  /** @internal */
  protected static _storageKeys: string[] = []

  /** @internal */
  protected static _storeNames: string[] = []

  //#endregion static
  //#region state

  /** @internal */
  protected _stateField: State<T, E> = getDefaultState()

  /** @internal */
  protected get _state(): State<T, E> {
    return this._stateField
  }
  protected set _state(value: State<T, E>) {
    if (isStackTracingErrors() && isDev() && !isCalledBy('_setState', 0)) {
      logError(`Store: "${this._storeName}" has called "_state" setter not from "_setState" method.`)
    }
    this._stateField = value
    DevToolsAdapter.states[this._storeName] = value
    DevToolsAdapter.values[this._storeName] = value.value
    this._state$.next(value)
    this._isLoading$.next(value.isLoading)
    this._isPaused$.next(value.isPaused)
    this._error$.next(value.error)
    this._value$.next(value.value)
  }

  /** @internal */
  protected readonly _state$ = new BehaviorSubject(this._state)

  /**
   * @get Returns the state.
   */
  public get state(): State<T, E> {
    return this._clone(this._state)
  }

  /** @internal */
  protected get _value(): Readonly<T> | null {
    return this._state.value
  }

  /** @internal */
  protected readonly _value$ = new BehaviorSubject(this._value)

  /**
   * @get Returns state's value.
   */
  public get value(): T | null {
    return this._clone(this._value)
  }

  /** @internal */
  protected readonly _isLoading$ = new BehaviorSubject(this._state.isLoading)
  /**
   * Store's loading state observable.
   */
  public readonly isLoading$: Observable<boolean> = this._isLoading$.asObservable().pipe(distinctUntilChanged())

  /**
   * @get Returns whether ot not the store is in loading state.
   */
  public get isLoading(): boolean {
    return this._state.isLoading
  }

  /** @internal */
  protected readonly _isPaused$ = new BehaviorSubject(this._state.isPaused)

  public isPaused$: Observable<boolean> = this._isPaused$.asObservable().pipe(distinctUntilChanged())

  /**
   * @get Returns whether ot not the store is in paused state.
   */
  public get isPaused(): boolean {
    return this._state.isPaused
  }
  public set isPaused(value: boolean) {
    this._setState({ isPaused: value }, value ? Actions.paused : Actions.unpause)
  }

  /**
   * @get Returns string literal that represents the store's tag.
   */
  public get storeTag(): StoreTags {
    const state = this._state
    if (this.isDestroyed) return StoreTags.destroyed
    if (state.isHardResettings) return StoreTags.hardResetting
    if (state.isLoading) return StoreTags.loading
    if (state.isPaused) return StoreTags.paused
    if (state.value) return StoreTags.active
    if (state.error) return StoreTags.error
    return StoreTags.resolving
  }

  /** @internal */
  protected _initialValue: Readonly<T> | null = null

  /**
   * @get Returns the initial value.
   */
  public get initialValue(): Readonly<T> | null {
    return this._initialValue
  }

  protected _isDestroyed = false
  /**
   * @get Returns whether  or not the store is destroyed.
   */
  public get isDestroyed(): boolean {
    return this._isDestroyed
  }

  //#endregion state
  //#region error-api

  /** @internal */
  protected readonly _error$ = new BehaviorSubject<E | null>(this._state.error)
  /**
   * Store's error state.
   */
  public readonly error$: Observable<E | null> =
    this._error$.asObservable()
      .pipe(
        map(x => isError(x) ? cloneError(x) : isObject(x) ? cloneObject(x) : x),
        distinctUntilChanged((prev, curr) => isNull(prev) && isNull(curr)),
      )

  /**
   * @get Returns the store's error state value.
   * @set Sets store's error state and also sets global error state if the value is not null.
   */
  public get error(): E | null {
    const value = this._state.error
    if (isError(value)) return cloneError(value)
    if (isObject(value)) return cloneObject(value)
    return value
  }
  public set error(value: E | null) {
    if (isError(value)) {
      value = cloneError(value)
    } else if (isObject(value)) {
      value = cloneObject(value)
    }
    this._setState({ error: value }, Actions.error)
  }

  //#endregion error-api
  //#region config

  /** @internal */
  protected readonly _config: StoreConfigInfo

  /**
   * @get Returns store's configuration.
   */
  public get config(): StoreConfigInfo {
    return this._config
  }

  /** @internal */
  protected readonly _storeName: string

  /** @internal */
  protected readonly _isResettable: boolean

  /** @internal */
  protected readonly _isSimpleCloning: boolean

  /** @internal */
  protected readonly _objectCompareType: ObjectCompareTypes

  /** @internal */
  protected readonly _storage: Storage | null

  /** @internal */
  protected readonly _storageDebounce: number

  /** @internal */
  protected readonly _storageKey: string

  /** @internal */
  protected readonly _clone: Clone

  /** @internal */
  protected readonly _compare: Compare

  /** @internal */
  protected readonly _freeze: Freeze

  /** @internal */
  protected readonly _stringify: Stringify

  /** @internal */
  protected readonly _parse: Parse

  //#endregion config
  //#region helper

  /** @internal */
  protected _valueToStorageSub: Subscription | null = null

  /** @internal */
  protected _asyncInitPromiseScope: PromiseScope | null = null

  /** @internal */
  protected readonly _queryScopes: QueryScope[] = []

  /** @internal */
  protected _lastAction: string | null = null

  //#endregion helpers
  //#region constructor

  constructor(storeConfig: StoreConfigOptions | undefined) {
    //#region configuration-initialization
    if (storeConfig) StoreConfig(storeConfig)(this.constructor as Class)
    this._config = cloneObject(this.constructor[STORE_CONFIG_KEY])
    delete this.constructor[STORE_CONFIG_KEY]
    const config = this._config
    this._storeName = config.name
    this._isResettable = config.isResettable
    this._isSimpleCloning = config.isSimpleCloning
    this._clone = !config.isImmutable ? x => x : this._isSimpleCloning ? simpleCloneObject : cloneObject
    this._freeze = config.isImmutable ? deepFreeze : x => x
    this._objectCompareType = config.objectCompareType
    this._compare = (() => {
      switch (this._objectCompareType) {
        case ObjectCompareTypes.advanced: return compareObjects
        case ObjectCompareTypes.simple: return simpleCompareObjects
        case ObjectCompareTypes.reference: return (a: object | any[], b: object | any[]) => a === b
      }
    })()
    config.objectCompareTypeName = ['Reference', 'Simple', 'Advanced'][this._objectCompareType]
    const storeName = this._storeName
    if (config.storageType != Storages.custom) {
      if (config.customStorageApi) {
        logWarn(`Store: "${storeName}" was provided with custom storage api implementation but storage type was not set to custom. Therefore custom storage api implementation will be ignored.`)
      }
      config.customStorageApi = null
    }
    if (config.storageType == Storages.custom && !this._config.customStorageApi) {
      logWarn(`Store: "${storeName}" has storage type set to custom but no custom storage api implementation was provided. Therefore storage type will be set to none.`)
      config.storageType = Storages.none
    }
    this._storage = (() => {
      switch (config.storageType) {
        case Storages.none: return null
        case Storages.local: return localStorage
        case Storages.session: return sessionStorage
        case Storages.custom: return this._config.customStorageApi
      }
    })()
    config.storageTypeName = [
      'None',
      'Local-Storage',
      'Session-Storage',
      'Custom',
    ][config.storageType]
    this._storageDebounce = config.storageDebounceTime
    this._storageKey = config.storageKey
    this._stringify = config.stringify
    this._parse = config.parse
    //#endregion configuration-initialization
  }

  //#endregion constructor
  //#region initialization-methods

  /** @internal */
  protected _main(initialValueOrNull: T | null): void {
    if (!this.config) throwError('Store must be provided with store configuration via decorator or via constructor.')
    const storeName = this._storeName
    this._assertStoreNameValid(storeName)
    BaseStore._storeNames.push(storeName)
    if (this._config.storageType != Storages.none) {
      const storageKey = this._storageKey
      this._assertStorageKeyValid(this._storageKey, storeName)
      BaseStore._storageKeys.push(storageKey)
    }
    if (isUndefined(initialValueOrNull)) throwError(`Store: "${storeName}" was provided with "undefined" as initial state.`)
    DevToolsAdapter.stores[storeName] = this
    if (isNull(initialValueOrNull)) {
      this._setState({ isLoading: true }, Actions.loading)
    } else {
      this._initializeStore(initialValueOrNull, false)
    }
  }

  /** @internal */
  protected _assertStoreNameValid(storeName: string): void {
    if (BaseStore._storeNames.includes(storeName)) {
      throwError(`Store name: "${storeName}"  is not unique.`)
    }
  }

  /** @internal */
  protected _assertStorageKeyValid(storageKey: string, storeName: string): void {
    if (BaseStore._storageKeys.includes(storageKey)) {
      throwError(`Storage key: "${storageKey}" in store: "${storeName}" is not unique.`)
    }
  }

  protected _assertInitializable(reject?: (reason: any) => void): boolean | never {
    if (this.isLoading && !this._initialValue && !this._value) return true
    const errMsg = `Store: "${this._storeName}" has already been initialized. You can hard reset the store if you want to reinitialize it.`
    if (!reject) throwError(errMsg)
    reject(newError(errMsg))
    return false
  }

  /** @internal */
  protected _initializeStore(initialValue: T, isAsync: boolean): void {
    let isValueFromStorage = false
    const storage = this._storage
    if (storage) {
      const storedValue: T | null = this._parse(storage.getItem(this._storageKey))
      if (storedValue) {
        initialValue = this._isSimpleCloning ? storedValue : instanceHandler(initialValue, storedValue)
        isValueFromStorage = true
      }
      this._valueToStorageSub = this._value$
        .pipe(debounceTime(this._storageDebounce))
        .subscribe(value => storage.setItem(this._storageKey, this._stringify(value)))
    }
    if (isFunction(this.onBeforeInit)) {
      const modifiedInitialValue: T | void = this.onBeforeInit(this._clone(initialValue))
      if (modifiedInitialValue) {
        initialValue = this._clone(modifiedInitialValue)
        isValueFromStorage = false
      }
    }
    initialValue = isValueFromStorage ? initialValue : this._clone(initialValue)
    this._initialValue = this._freeze(initialValue)
    this._setState(() => this._clone(initialValue), isAsync ? Actions.initAsync : Actions.init, { isLoading: false })
    assert(this._value, `Store: "${this._storeName}" state could not be set durning initialization.`)
    if (isFunction(this.onAfterInit)) {
      const modifiedValue: T | void = this.onAfterInit(this._clone(this._value))
      if (modifiedValue) this._setState(() => this._clone(modifiedValue), Actions.afterInitUpdate)
    }
  }

  /**
   * Method used for delayed initialization.
   */
  public initialize(initialValue: T): void {
    if (this._assertInitializable()) this._initializeStore(initialValue, false)
  }

  /**
   * Method for asynchronous initialization.
   * - In case of an observable, only the finite value will be used.
   */
  public initializeAsync(promise: Promise<T>): Promise<void>
  public initializeAsync(observable: Observable<T>): Promise<void>
  public initializeAsync(promiseOrObservable: Promise<T> | Observable<T>): Promise<void> {
    const asyncInitPromiseScope = createPromiseScope()
    this._asyncInitPromiseScope = asyncInitPromiseScope
    asyncInitPromiseScope.promise = new Promise((resolve, reject) => {
      if (!this._assertInitializable(reject)) return
      if (isObservable(promiseOrObservable)) promiseOrObservable = promiseOrObservable.toPromise()
      promiseOrObservable.then(r => {
        if (asyncInitPromiseScope.isCancelled) return
        if (!this._assertInitializable(reject)) return
        if (isFunction(this.onAsyncInitSuccess)) {
          const modifiedResult = this.onAsyncInitSuccess(r)
          if (modifiedResult) r = modifiedResult
        }
        this._initializeStore(r, true)
      }).catch(e => {
        if (asyncInitPromiseScope.isCancelled) return
        if (isFunction(this.onAsyncInitError)) {
          e = this.onAsyncInitError(e)
        }
        if (e) return reject(e)
      }).finally(resolve)
    })
    return asyncInitPromiseScope.promise
  }

  //#endregion initialization-methods
  //#region state-methods

  /** @internal */
  protected _setState(
    valueFnOrState: ((stateValue: Readonly<T> | null) => T) | Partial<State<T, E>>,
    actionName: string | Actions,
    stateExtension?: Partial<State<T, E>>
  ): void {
    if (this.isDestroyed) return
    if (isFunction(valueFnOrState)) {
      valueFnOrState = {
        value: this._freeze(valueFnOrState(this._value))
      }
    }
    this._state = objectAssign(this._state, valueFnOrState, stateExtension || null)
    this._lastAction = actionName
    if (isDevTools()) {
      DevToolsAdapter.stateChange$.next({
        storeName: this._storeName,
        state: this._state,
        actionName
      })
    }
  }

  //#endregion state-methods
  //#region update-methods

  /**
   * Updates the store's state using a partial state. The provided partial state will be then merged with current store's state.
   * - If you want to override the current store's state, use the `override` method.
   * @example
   *  weatherStore.update({ isWindy: true });
   */
  public update(value: Partial<T>, actionName?: string): void
  /**
   * Updates the store's state using a function that will be called by the store.
   * The function will be provided with the current state as a parameter and it must return a new partial state.
   * The returned partial state will be then merged with current store's state.
   * - If you want to override the current store's state, use the `override` method.
   * @example
   * weatherStore.update(state => ({
   *    isSunny: !state.isRaining
   * }));
   */
  public update(valueFunction: (value: Readonly<T>) => Partial<T>, actionName?: string): void
  public update(valueOrFunction: ((value: Readonly<T>) => Partial<T>) | Partial<T>, actionName?: string): void {
    if (this.isPaused) return
    this._setState(value => {
      assert(value && this._initialValue && !this.isLoading, `Store: "${this._storeName}" can't be updated before it was initialized`)
      const newPartialValue = isFunction(valueOrFunction) ? valueOrFunction(value) : valueOrFunction
      let newValue = mergeObjects(this._clone(value), this._clone(newPartialValue))
      if (!this._isSimpleCloning) newValue = instanceHandler(this._initialValue, newValue)
      if (isFunction(this.onUpdate)) {
        const newModifiedValue: T | void = this.onUpdate(this._clone(newValue), value)
        if (newModifiedValue) newValue = this._clone(newModifiedValue)
      }
      return newValue
    }, actionName || Actions.update)
  }

  /**
   * Overrides the current state's value completely.
   */
  public override(value: T, actionName?: string): void {
    if (this.isPaused) return
    assert(this._value && this._initialValue && !this.isLoading,
      `Store: "${this._storeName}" can't be overridden before it was initialized`)
    if (!this._isSimpleCloning) value = instanceHandler(this._initialValue, this._clone(value))
    let modifiedValue: T | void
    if (isFunction(this.onOverride)) {
      modifiedValue = this.onOverride(this._clone(value), this._value)
      if (modifiedValue) value = this._clone(modifiedValue)
    }
    const isCloned = !this._isSimpleCloning || !!modifiedValue
    this._setState(() => isCloned ? value : this._clone(value), actionName || Actions.override)
  }

  //#endregion update-methods
  //#region reset-dispose-destroy-methods

  /**
   * Resets the state's value to it's initial value.
   */
  public reset(actionName?: string): void | never {
    if (this.isPaused) return
    this._setState(value => {
      const initialValue = this._initialValue
      assert(value && initialValue && !this.isLoading, `Store: "${this._storeName}" can't be reseted before it was initialized`)
      assert(this._isResettable, `Store: "${this._storeName}" is not configured as resettable.`)
      let modifiedInitialValue: T | void
      if (isFunction(this.onReset)) modifiedInitialValue = this.onReset(this._clone(initialValue), value)
      return this._clone(modifiedInitialValue || initialValue)
    }, actionName || Actions.reset)
  }

  /**
   * Sets the following:
   * - State's value will be set to `null`.
   * - State's error will be set to `null`.
   * - Store's initial value will be set to `null`.
   * - Sets _isPaused_ to `false`.
   * - Sets the store into loading state.
   * - Clears store's cache storage if any (LocalStorage, SessionStorage, etc.).
   */
  public hardReset(): Promise<this> {
    if (!this._isResettable) {
      return Promise.reject(new Error(`Store: "${this._storeName}" is not configured as resettable.`))
    }
    this._setState({ isHardResettings: true }, Actions.hardResetting)
    const asyncInitPromiseScope = this._asyncInitPromiseScope
    const initializeAsyncPromiseState: Promise<void | PromiseStates> =
      asyncInitPromiseScope && asyncInitPromiseScope.promise ?
        getPromiseState(asyncInitPromiseScope.promise) :
        Promise.resolve()
    return new Promise((resolve) => {
      const reset = () => {
        if (this._valueToStorageSub) this._valueToStorageSub.unsubscribe()
        if (this._storage) this._storage.removeItem(this._storageKey)
        this._queryScopes.forEach(x => x.wasHardReset = true)
        this._initialValue = null
        this._setState({
          value: null,
          error: null,
          isPaused: false,
          isHardResettings: false,
          isLoading: true,
        }, Actions.loading)
        resolve(this)
      }
      initializeAsyncPromiseState.then(state => {
        if (asyncInitPromiseScope) asyncInitPromiseScope.isCancelled = state === PromiseStates.pending
        reset()
      }).catch(() => reset())
    })
  }

  public disposeQueryScope(observable: Observable<T>): void {
    const queryScopes = this._queryScopes
    const i = queryScopes.findIndex(x => x.observable = observable)
    if (i != -1) {
      queryScopes[i].isDisposed = true
      queryScopes.splice(i, 1)
    }
  }

  public destroy(): Promise<void> {
    const asyncInitPromiseScope = this._asyncInitPromiseScope
    const initializeAsyncPromiseState: Promise<void | PromiseStates> =
      asyncInitPromiseScope && asyncInitPromiseScope.promise ?
        getPromiseState(asyncInitPromiseScope.promise) :
        Promise.resolve()
    return new Promise((resolve) => {
      const destroy = () => {
        const storeName = this._storeName
        delete DevToolsAdapter.stores[storeName]
        delete DevToolsAdapter.states[storeName]
        delete DevToolsAdapter.values[storeName]
        if (this._valueToStorageSub) this._valueToStorageSub.unsubscribe()
        if (this._storage) this._storage.removeItem(this._storageKey)
        this._queryScopes.forEach(x => x.isDisposed = true)
        this._initialValue = null
        for (const key in this) {
          if (!this.hasOwnProperty(key)) continue
          const prop = this[key]
          if (prop instanceof Subject) prop.complete()
        }
        this._setState({
          value: null,
          error: null,
          isPaused: false,
          isHardResettings: false,
          isLoading: false,
        }, Actions.destroy)
        this._isDestroyed = true
        resolve()
      }
      initializeAsyncPromiseState.then(state => {
        if (asyncInitPromiseScope) asyncInitPromiseScope.isCancelled = state === PromiseStates.pending
        destroy()
      }).catch(() => destroy())
    })
  }

  //#endregion reset-dispose-destroy-methods
  //#region hooks

  /**
   * @virtual Override to use `onBeforeInit` hook.
   * - Will be called before the store has completed the initialization.
   * - Allows state's value modification before the initialization is complete.
   */
  protected onBeforeInit?(nextState: T): void | T

  /**
   * @virtual Override to use `onAfterInit` hook.
   * - Will be called once the store has completed initialization.
   * - Allows state's value modification after initialization.
   */
  protected onAfterInit?(currState: T): void | T

  /**
   * @virtual Override to use `onAsyncInitError` hook.
   * - Will be called if there is an error during async initialization.
   * - Allows error manipulation.
   * - If the method returns an error, it will bubble via promise rejection.
   * - If method returns void, the error will will not bubble further.
   */
  protected onAsyncInitError?(error: E): void | E

  /**
   * @virtual Override to use `onAsyncInitSuccess` hook.
   * - Will be called once data is received during async initialization.
   * - Allows data manipulations like mapping and etc.
   */
  protected onAsyncInitSuccess?(result: T): void | T

  /**
   * @virtual Override to use `onUpdate` hook.
   * - Will be called after the update method has merged the changes with the given state and just before this state is set.
   * - Allows future state modification.
   */
  protected onUpdate?(nextState: T, currState: Readonly<T>): void | T

  /**
   * @virtual Override to use `onOverride` hook.
   * - Will be called after the override method and just before the new state is set.
   * - Allows future state modification.
   */
  protected onOverride?(nextState: T, prevState: Readonly<T>): void | T

  /**
   * @virtual Override to use `onReset` hook.
   * - Will be called after the reset method and just before the new state is set.
   * - Allows future state modification.
   */
  protected onReset?(nextState: T, currState: Readonly<T>): void | T

  //#endregion hooks
}
