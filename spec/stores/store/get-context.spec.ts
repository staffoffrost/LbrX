
import { StoreContext as StoreContext_type } from 'lbrx'
import { StoresFactory as StoresFactory_type, TestSubjectFactory } from '__test__/factories'

describe(`Store - getContext():`, () => {

  const createInitialState = () => TestSubjectFactory.createTestSubject_initial()
  let StoresFactory: typeof StoresFactory_type
  let StoreContext: typeof StoreContext_type

  beforeEach(async () => {
    const provider = await import(`provider`)
    StoresFactory = provider.StoresFactory
    StoreContext = provider.StoreContext
  })

  it(`should return an instance of StoreContext.`, () => {
    const store = StoresFactory.createStore(createInitialState())
    expect(store.getContext()).toBeInstanceOf(StoreContext)
  })

  it(`should return a new instance of StoreContext.`, () => {
    const store = StoresFactory.createStore(createInitialState())
    const storeContext1 = store.getContext()
    const storeContext2 = store.getContext()
    expect(storeContext1).not.toBe(storeContext2)
  })
})