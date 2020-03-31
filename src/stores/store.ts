import { DevToolsSubjects } from '../dev-tools/dev-tools-subjects'
import { BehaviorSubject, timer, Observable, isObservable, of, iif } from 'rxjs'
import { debounce, map, distinctUntilChanged, filter, tap, mergeMap, switchMap } from 'rxjs/operators'
import { StoreConfigOptions, Storages, STORE_CONFIG_KEY, ObjectCompareTypes, StoreConfigOptionsInfo } from './config'
import { DevToolsDataStruct } from '../dev-tools/store-dev-object'
import { isNull, objectAssign, stringify, parse, deepFreeze, isFunction, isObject, compareObjects, instanceHandler, cloneObject, simpleCompareObjects, simpleCloneObject, mergeObjects, logError, isNullish, throwError, isError, cloneError, logWarn } from 'lbrx/helpers'
import { isDev, isDevTools } from 'lbrx/mode'
import { GlobalErrorStore } from './global-error-store'
import { validateStoreName, validateStorageKey } from './store-unique-name-enforcer'

// tslint:disable: no-redundant-jsdoc
// tslint:disable: unified-signatures
// tslint:disable: no-string-literal

/**
 * @example
 * const createUiState: UiState = () => {
 * 	return {...}
 * }
 *
 * `@`StoreConfig({
 * 	name: 'UI-STORE'
 * })
 * export class UiStore extends Store<UiState, AppError> {
 *
 * 	constructor() {
 * 		super(createUiState())
 * 	}
 * }
 */
export class Store<T extends object, E = any> {

	//#region loading-state

	private readonly _isLoading$ = new BehaviorSubject<boolean>(false)
	/**
	 * Weather or not the store is in it's loading state.
	 * - If the initial value at the constructor is null,
	 * the store will automatically set it self to a loading state and
	 * then will set it self to none loading state after it wil be initialized.
	 * - While the store is in loading state, no values will be emitted to state's subscribers.
	 */
	public get isLoading$(): Observable<boolean> {
		return this._isLoading$.asObservable().pipe(distinctUntilChanged())
	}
	/**
	 * @get Returns store's loading state.
	 * @set Sets store's loading state.
	 */
	public get isLoading(): boolean {
		return this._isLoading$.getValue()
	}
	public set isLoading(value: boolean) {
		this._isLoading$.next(value)
	}

	//#endregion loading-state
	//#region error-api

	private readonly _error$ = new BehaviorSubject<E | null>(null)
	/**
	 * Store's error state.
	 */
	public get error$(): Observable<E | null> {
		return this._error$.asObservable()
			.pipe(
				map(x => {
					if (isError(x)) return cloneError(x)
					if (isObject(x)) return cloneObject(x)
					return x
				}),
				distinctUntilChanged((prev, curr) => isNull(prev) && isNull(curr)),
			)
	}

	//#endregion error-api
	//#region state-properties

	private readonly _state$ = new BehaviorSubject<T | null>(null)
	private _state: Readonly<T> = null as unknown as T
	private set state(value: T) {
		this._state = value
		this._state$.next(value)
	}
	/**
	 * Returns stores current state's value.
	 */
	public get value(): T {
		return isNull(this._state) ? this._state : this._clone(this._state)
	}

	private _initialState!: Readonly<T>
	/**
	 * Returns stores initial state's value.
	 */
	public get initialValue(): Readonly<T> | null {
		return this._clone(this._initialState)
	}

	//#endregion state-properties
	//#region config

	private _config!: StoreConfigOptionsInfo
	/**
	 * Returns store's active configuration.
	 */
	public get config(): StoreConfigOptionsInfo {
		return this._config
	}
	private _storeName!: string
	private _isResettable!: boolean
	private _isSimpleCloning!: boolean
	private _objectCompareType!: ObjectCompareTypes
	private _storage!: Storage | null
	private _storageDebounce!: number
	private _storageKey!: string
	private _clone!: <R extends object>(obj: R) => R
	private _compare!: <R extends object>(objA: R, pbjB: R) => boolean
	private _stringify!: (
		value: any,
		replacer?: (this: any, key: string, value: any) => any | (number | string)[] | null,
		space?: string | number
	) => string
	private _parse!: (text: string | null, reviver?: (this: any, key: string, value: any) => any) => T

	private get devData(): DevToolsDataStruct {
		return { name: this._storeName, state: this._clone(this._state) }
	}

	//#endregion config
	//#region constructor

	/**
	 * @param initialState - Null as an initial state will activate stores loading state.
	 * @param storeConfig ? - Set this parameter only if you creating
	 * store's instance without extending it.
	 */
	constructor(initialState: null, storeConfig?: StoreConfigOptions)
	/**
	 * @param initialState - Set all state's params for the initial value. Use Null for
	 * unneeded properties instead of undefined.
	 * @param storeConfig ?- Set this parameter only if you creating
	 * store's instance without extending it.
	 */
	constructor(initialState: T, storeConfig?: StoreConfigOptions)
	constructor(initialStateOrNull: T | null, storeConfig?: StoreConfigOptions) {
		this._main(initialStateOrNull, storeConfig)
	}

	//#endregion constructor
	//#region private-section

	private _main(initialStateOrNull: T | null, storeConfig?: StoreConfigOptions): void {
		this._initializeConfig(storeConfig)
		if (!this.config) throwError(`Store must be decorated with the "@StoreConfig" decorator or store config must supplied via the store's constructor!`)
		validateStoreName(this._storeName)
		if (this._config.storageType != Storages.none) validateStorageKey(this._storageKey, this._storeName)
		if (isDevTools()) DevToolsSubjects.stores[this._storeName] = this
		if (isNull(initialStateOrNull)) {
			this._isLoading$.next(true)
			isDevTools() && DevToolsSubjects.loadingEvent$.next(this._storeName)
		} else {
			this._initializeStore(initialStateOrNull)
		}
	}

	private _initializeConfig(storeConfig?: StoreConfigOptions): void {
		this._config = cloneObject(storeConfig ? storeConfig : this.constructor[STORE_CONFIG_KEY])
		delete this.constructor[STORE_CONFIG_KEY]
		this._storeName = this._config.name
		this._isResettable = this._config.isResettable
		this._isSimpleCloning = this._config.isSimpleCloning
		this._clone = this._isSimpleCloning ? simpleCloneObject : cloneObject
		this._objectCompareType = this._config.objectCompareType
		this._compare = (() => {
			switch (this._objectCompareType) {
				case ObjectCompareTypes.advanced: return compareObjects
				case ObjectCompareTypes.simple: return simpleCompareObjects
				case ObjectCompareTypes.reference: return (a: T, b: T) => a === b
			}
		})()
		this._config.objectCompareTypeName = ['Reference', 'Simple', 'Advanced'][this._objectCompareType]
		if (this._config.storageType != Storages.custom) {
			if (this._config.customStorageApi) {
				logWarn(`Custom storage api is configured but storage type is not set to custom. Store name: ${this._storeName}`)
			}
			this._config.customStorageApi = null
		}
		if (this._config.storageType == Storages.custom && !this._config.customStorageApi) {
			logWarn(`Custom storage type is configured while custom storage api is not. Store name: ${this._storeName}`)
			this._config.storageType = Storages.none
		}
		this._storage = (() => {
			switch (this._config.storageType) {
				case Storages.none: return null
				case Storages.local: return localStorage
				case Storages.session: return sessionStorage
				case Storages.custom: return this._config.customStorageApi
			}
		})()
		this._config.storageTypeName = [
			'None',
			'Local-Storage',
			'Session-Storage',
			'Custom',
		][this._config.storageType]
		this._storageDebounce = this._config.storageDebounceTime
		this._storageKey = this._config.storageKey
		this._stringify = this._config.stringify
		this._parse = this._config.parse
	}

	private _initializeStore(initialState: T): void {
		let isStateCloned = false
		if (isFunction(this['onBeforeInit'])) {
			const modifiedInitialState: T | void = this['onBeforeInit'](this._clone(initialState))
			if (modifiedInitialState) {
				initialState = this._clone(modifiedInitialState)
				isStateCloned = true
			}
		}
		this._initialState = deepFreeze(this._clone(initialState))
		const storage = this._storage
		if (storage) {
			let storedState: T | null = this._parse(storage.getItem(this._storageKey))
			if (storedState) {
				if (!this._isSimpleCloning) storedState = instanceHandler(initialState, storedState)
				initialState = storedState
				isStateCloned = true
			}
			this._state$
				.pipe(debounce(() => timer(this._storageDebounce)))
				.subscribe(state => storage.setItem(this._storageKey, this._stringify(state)))
		}
		this._setState(() => isStateCloned ? initialState : this._clone(initialState))
		if (isFunction(this['onAfterInit'])) {
			const modifiedState: T | void = this['onAfterInit'](this._clone(this._state))
			if (modifiedState) this._setState(() => this._clone(modifiedState))
		}
		isDevTools() && DevToolsSubjects.initEvent$.next(this.devData)
	}

	private _setState(newStateFn: (state: Readonly<T>) => T): void {
		this.state = isDev() ? deepFreeze(newStateFn(this._state)) : newStateFn(this._state)
	}

	//#endregion private-section
	//#region public-api

	/**
	 * Use this method to initialize the store.
	 * - Use only if the constructor state's value was null.
	 * - Will throw in development mode if the store is not in loading state
	 * or it was initialized before.
	 * - In production mode, this method will be ignored if the store is not in loading state
	 * or it was initialized before.
	 */
	public initialize(initialState: T): void | never {
		if (!this.isLoading || this._initialState || this._state) {
			isDev() && throwError("Can't initialize store that's already been initialized or its not in LOADING state!")
			return
		}
		this._initializeStore(initialState)
		this._isLoading$.next(false)
	}

	/**
	 * Use this method to initialize the store with async data.
	 * - Use only if the constructor state's value was null.
	 * - Will throw in development mode if the store is not in loading state
	 * or it was initialized before.
	 * - In production mode, this method will be ignored if the store is not in loading state
	 * or it was initialized before.
	 * - In case of observable, only finite observable value will be used.
	 */
	public initializeAsync(promise: Promise<T>): Promise<void>
	public initializeAsync(observable: Observable<T>): Promise<void>
	public initializeAsync(promiseOrObservable: Promise<T> | Observable<T>): Promise<void> {
		if (!this.isLoading || this._initialState || this._state) {
			return isDev() ?
				Promise.reject("Can't initialize store that's already been initialized or its not in LOADING state!") :
				Promise.resolve()
		}
		return new Promise(async (resolve, reject) => {
			if (isObservable(promiseOrObservable)) {
				promiseOrObservable = promiseOrObservable.toPromise()
			}
			promiseOrObservable.then(r => {
				if (!this.isLoading || this._initialState || this._state) {
					isDev() && reject('The store was initialized multiple time while it was in loading state.')
				} else {
					if (isFunction(this['onAsyncInitSuccess'])) {
						const modifiedResult = this['onAsyncInitSuccess'](r)
						if (modifiedResult) r = modifiedResult
					}
					this._initializeStore(r)
					this._isLoading$.next(false)
				}
			}).catch(e => {
				if (isFunction(this['onAsyncInitError'])) {
					e = this['onAsyncInitError'](e)
				}
				e && reject(e)
			}).finally(resolve)
		})
	}

	/**
	 * Update the store's value
	 * @example
	 *  this.store.update({ key: value })
	 */
	public update(state: Partial<T>, updateName?: string): void
	/**
	 * Update the store's value
	 * @example
	 * this.store.update(state => {
	 *   return {...}
	 * })
	 */
	public update(stateCallback: (state: Readonly<T>) => Partial<T>, updateName?: string): void
	public update(stateOrCallback: ((state: Readonly<T>) => Partial<T>) | Partial<T>, updateName?: string): void {
		if (this.isLoading) {
			logError(`Can't update ${this._storeName} while it's in loading state.`)
			return
		}
		this._setState(state => {
			const newPartialState = isFunction(stateOrCallback) ? stateOrCallback(state) : stateOrCallback
			let newState = mergeObjects(this._clone(state), this._clone(newPartialState))
			if (!this._isSimpleCloning) newState = instanceHandler(this._initialState, newState)
			if (isFunction(this['onUpdate'])) {
				const newModifiedState: T | void = this['onUpdate'](this._clone(newState), state)
				if (newModifiedState) newState = this._clone(newModifiedState)
			}
			return newState
		})
		isDevTools() && DevToolsSubjects.updateEvent$.next(updateName ? objectAssign(this.devData, { updateName }) : this.devData)
	}

	/**
	 * Overrides the state's value completely, without merging.
	 */
	public override(state: T): void {
		if (this.isLoading) {
			logError(`Can't override ${this._storeName} while it's in loading state.`)
			return
		}
		if (!this._isSimpleCloning) state = instanceHandler(this._initialState, this._clone(state))
		let modifiedState: T | void
		if (isFunction(this['onOverride'])) {
			modifiedState = this['onOverride'](this._clone(state), this._state)
			if (modifiedState) state = this._clone(modifiedState)
		}
		const isCloned = !this._isSimpleCloning || !!modifiedState
		this._setState(() => isCloned ? state : this._clone(state))
		isDev() && DevToolsSubjects.overrideEvent$.next(this.devData)
	}

	/**
	 * Resets the store's state to it's initial value.
	 */
	public reset(): void | never {
		if (this.isLoading) {
			logError(`Can't reset ${this._storeName} while it's in loading state.`)
			return
		} else if (!this._isResettable) {
			const errMsg = `Store: ${this._storeName} is not configured as resettable.`
			isDev() ? throwError(errMsg) : logError(errMsg)
		} else {
			this._setState(state => {
				let modifiedInitialState: T | void
				if (isFunction(this['onReset'])) modifiedInitialState = this['onReset'](this._clone(this._initialState), state)
				return this._clone(modifiedInitialState || this._initialState)
			})
			isDevTools() && DevToolsSubjects.resetEvent$.next({ name: this._storeName, state: this._clone(this._initialState) })
		}
	}

	/**
	 * Resets the following store parameters:
	 * - State will be set to null.
	 * - Initial state will be set to null.
	 * - Activates Loading state.
	 * - Store's error will be set to null.
	 * - Clears cached storage if any.
	 */
	public hardReset(): this {
		if (!this._isResettable) {
			const errMsg = `Store: ${this._storeName} is not configured as resettable.`
			isDev() ? throwError(errMsg) : logError(errMsg)
		} else {
			isDevTools() && DevToolsSubjects.hardResetEvent$.next(this._storeName)
			this._isLoading$.next(true)
			this.state = null as unknown as T
			this._initialState = null as unknown as T
			this.setError(null)
			this._storage && this._storage.removeItem(this._storageKey)
			isDevTools() && DevToolsSubjects.loadingEvent$.next(this._storeName)
		}
		return this
	}

	/**
	 * Returns whole state as an Observable.
	 * @example
	 * state$ = this.store.select()
	 *
	 * myFunc() {
	 * 	this.tate$.subscribe(state => {
	 * 		// do some work...
	 * 	})
	 * }
	 */
	public select(): Observable<T>
	/**
	 * Returns partial state as an Observable.
	 * @example
	 * isSideNavOpen$ = this.store.select(state => state.isSideNavOpen)
	 *
	 * myFunc() {
	 * 	this.isSideNavOpen$.subscribe(isSideNavOpen => {
	 * 		// do some work...
	 * 	})
	 * }
	 */
	public select<R>(project: (state: T) => R): Observable<R>
	public select<R>(project?: (state: T) => R): Observable<T | R> {
		const tillLoaded$ = this._isLoading$.asObservable()
			.pipe(
				filter(x => !x),
				distinctUntilChanged(),
				switchMap(() => this._state$),
			)
		let wasHardReseted = false
		return this._state$.asObservable()
			.pipe(
				tap(x => {
					if (!wasHardReseted) wasHardReseted = !x && this.isLoading
				}),
				mergeMap(x => iif(() => this.isLoading, tillLoaded$, of(x))),
				filter<T>(x => !!x),
				map<T, T | R>(project || (x => x)),
				distinctUntilChanged((prev, curr) => {
					if (wasHardReseted) {
						wasHardReseted = false
						return false
					}
					return (isObject(prev) && isObject(curr)) ? this._compare(prev, curr) : prev === curr
				}),
				map(x => isObject(x) ? this._clone(x) : x),
			)
	}

	/**
	 * Returns the store's error state value.
	 */
	public getError(): E | null {
		const value = this._error$.getValue()
		if (isError(value)) return cloneError(value)
		if (isObject(value)) return cloneObject(value)
		return value
	}

	/**
	 * Sets store's error state and also sets global error state if the value is not null.
	 */
	public setError(value: E | null): void {
		if (isError(value)) {
			value = cloneError(value)
		} else if (isObject(value)) {
			value = cloneObject(value)
		}
		this._error$.next(value)
		if (!isNullish(value)) GlobalErrorStore.getStore<E>().setError(value)
	}

	//#endregion public-api
}
