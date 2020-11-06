import { Store } from 'lbrx'
import { ErrorFactory, TestSubjectFactory } from '__test__/factories'
import { assertNotNullable } from '__test__/functions'
import { ErrorTestSubject, TestSubject } from '__test__/test-subjects'

describe(`Store Error Reference:`, () => {

  const error = ErrorFactory.createError()
  const nestedError = ErrorFactory.createNestedError()
  const pureNestedError = ErrorFactory.createNestedError()
  const initialState = TestSubjectFactory.createTestSubject_initial()
  let store: Store<TestSubject, Error>
  let loadingStore: Store<TestSubject, ErrorTestSubject>

  beforeEach(async () => {
    const providerModule = await import(`provider`)
    store = providerModule.StoresFactory.createStore(initialState)
    loadingStore = providerModule.StoresFactory.createStore<TestSubject>(null, `LOADING-STORE`)
  })

  afterEach(() => {
    jest.resetModules()
  })

  it(`should return the exact same error.`, () => {
    loadingStore.error = nestedError
    expect(loadingStore.error).toStrictEqual(pureNestedError)
  })

  it(`should return the error with different reference after setting it.`, () => {
    store.error = error
    expect(store.error).toBeTruthy()
    expect(store.error).not.toBe(error)
  })

  it(`should return the error with different reference for the inner error after setting it.`, () => {
    assertNotNullable(nestedError?.innerError?.innerError)
    loadingStore.error = nestedError
    const storesError = loadingStore.error
    assertNotNullable(storesError?.innerError?.innerError)
    expect(storesError.innerError.innerError).not.toBe(nestedError.innerError.innerError)
  })

  it(`should not be effected by error object change after set.`, () => {
    const newErrorMsg = `New error message`
    const localError = ErrorFactory.createError()
    store.error = localError
    localError.message = newErrorMsg
    const storesError = store.error
    assertNotNullable(storesError)
    expect(storesError.message).toBeTruthy()
    expect(storesError.message).not.toBe(newErrorMsg)
  })

  it(`should not be effected by returned error object change.`, () => {
    const newErrorMsg = `New error message`
    let localError: Error | null = ErrorFactory.createError()
    store.error = localError
    localError = store.error
    assertNotNullable(localError)
    localError.message = newErrorMsg
    const storesError = store.error
    assertNotNullable(storesError)
    expect(storesError.message).toBeTruthy()
    expect(storesError.message).not.toBe(newErrorMsg)
  })

  it(`should have different nested custom error object reference.`, () => {
    loadingStore.error = nestedError
    assertNotNullable(nestedError.innerError?.innerError)
    const storesError = loadingStore.error
    assertNotNullable(storesError?.innerError?.innerError)
    expect(storesError.innerError.innerError).not.toBe(nestedError.innerError.innerError)
  })

  it(`should not be effected by custom error object's change after set.`, () => {
    const newErrorMsg = `New error message`
    const localError = ErrorFactory.createNestedError()
    loadingStore.error = localError
    assertNotNullable(localError.innerError?.innerError)
    localError.innerError.innerError.message = newErrorMsg
    const storesError = loadingStore.error
    assertNotNullable(storesError?.innerError?.innerError)
    expect(storesError.innerError.innerError).not.toBe(newErrorMsg)
  })
})