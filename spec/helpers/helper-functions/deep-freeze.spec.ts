import { deepFreeze } from 'lbrx/utils'
import { TestSubjectFactory } from '__test__/factories'
import { assertIsArray, assertNotNullable } from '__test__/functions'
import { TestSubject, TestSubjectConfigurations } from '__test__/test-subjects'

describe(`Helper Function - deepFreeze():`, () => {

  let testSubject: TestSubject

  beforeEach(() => {
    testSubject = TestSubjectFactory.createTestSubject_configA()
    deepFreeze(testSubject)
  })

  it(`should cause the test subject entity to throw on string's value modification.`, () => {
    expect(() => {
      testSubject.stringValue = `some other string`
    }).toThrow()
  })

  it(`should cause the test subject entity to throw on date's modification.`, () => {
    assertNotNullable(testSubject.dateValue)
    expect(() => {
      testSubject.dateValue!.setFullYear(1986)
    }).toThrow()
  })

  it(`should cause the test subject entity to throw on inner object's date modification.`, () => {
    assertNotNullable(testSubject.innerTestObject?.dateValue)
    expect(() => {
      testSubject.innerTestObject!.dateValue!.setFullYear(1986)
    }).toThrow()
  })

  it(`should cause the test subject entity to throw on inners object modification.`, () => {
    assertNotNullable(testSubject.innerTestObject)
    expect(() => {
      const newInnerTestObject = TestSubjectFactory.createInnerTestSubject(TestSubjectConfigurations.configurationB)
      testSubject.innerTestObject = newInnerTestObject
    }).toThrow()
  })

  it(`should cause the test subject entity to throw on adding a new item to a inner object's list.`, () => {
    assertIsArray(testSubject.innerTestObjectGetSet?.deepNestedObj?.objectList)
    expect(() => {
      const newObjForList = {
        value: `string`,
        date: new Date()
      }
      testSubject.innerTestObjectGetSet!.deepNestedObj!.objectList!.push(newObjForList)
    }).toThrow()
  })

  it(`should cause the test subject entity to throw on inner object's list item modification.`, () => {
    assertIsArray(testSubject.innerTestObjectGetSet?.deepNestedObj?.objectList)
    assertNotNullable(testSubject.innerTestObjectGetSet.deepNestedObj.objectList[0])
    expect(() => {
      const newObjForReplacement = {
        value: `string`,
        date: new Date()
      }
      testSubject.innerTestObjectGetSet!.deepNestedObj!.objectList![0] = newObjForReplacement
    }).toThrow()
  })

  it(`should cause the test subject entity to throw on inner object's list replacement.`, () => {
    assertIsArray(testSubject.innerTestObjectGetSet?.deepNestedObj?.objectList)
    expect(() => {
      testSubject.innerTestObjectGetSet!.deepNestedObj!.objectList = []
    }).toThrow()
  })

  it(`should return the given object object.`, () => {
    const list = TestSubjectFactory.createTestSubject_list_initial()
    const returnedList = deepFreeze(list)
    expect(returnedList).toBe(list)
  })

  it(`should not modify the values of the object.`, () => {
    const list = TestSubjectFactory.createTestSubject_list_initial()
    const returnedList = deepFreeze(list)
    expect(list).toStrictEqual(TestSubjectFactory.createTestSubject_list_initial())
    expect(returnedList).toStrictEqual(TestSubjectFactory.createTestSubject_list_initial())
  })

  it(`should freeze a list of objects.`, () => {
    const list = TestSubjectFactory.createTestSubject_list_initial()
    deepFreeze(list)
    expect(() => {
      list[5].stringValue = `123123`
    }).toThrow()
  })

  it(`should not throw if freezing the same object twice.`, () => {
    const list = TestSubjectFactory.createTestSubject_list_initial()
    deepFreeze(list)
    expect(() => {
      deepFreeze(list)
    }).not.toThrow()
  })

  it(`should not freeze inner props if 'Object.getOwnPropertyDescriptor' returns undefined.`, () => {
    jest.spyOn(Object, `getOwnPropertyDescriptor`).mockReturnValue(undefined)
    testSubject = TestSubjectFactory.createTestSubject_configA()
    deepFreeze(testSubject)
    expect(() => {
      testSubject.stringValue = `some other string`
    }).toThrow()
    assertIsArray(testSubject.innerTestObjectGetSet?.deepNestedObj?.objectList)
    expect(() => {
      testSubject.innerTestObjectGetSet!.deepNestedObj!.objectList = []
    }).toThrow()
  })
})
