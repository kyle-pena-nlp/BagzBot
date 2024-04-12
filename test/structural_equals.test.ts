import { Structural, structuralEquals } from "../util";

test("empty_eq_empty", () => {
    test_eq({},{})
})

test("zero_eq_zero", () => {
    test_eq(0,0);
})

test("null_eq_null", () => {
    test_eq(null,null)
})

test("undefined_eq_undefined", () => {
    test_eq(undefined,undefined)
})

test("zero_neq_null", () => {
    test_neq(0,null)
})

test("zero_neq_undefined", () => {
    test_neq(0,undefined)
})

test("null_neq_undefined", () => {
    test_neq(null,undefined)
})

test("3_eq_3", () => {
    test_eq(3,3)
})

test("false_eq_false", () => {
    test_eq(false,false)
})

test("false_neq_true", () => {
    test_neq(false,true)
})

test("false_neq_null", () => {
    test_neq(false,null);
})

test("false_neq_undefined", () => {
    test_neq(false,undefined)
})

test("false_neq_zero", () => {
    test_neq(false,0)
})

test("obj_neq_obj_without_prop", () => {
    test_neq({ a: 1 }, { })
})

test("obj_neq_obj_different_prop", () => {
    test_neq({ a: 1 }, { b: 1 })
})

test("obj_neq_obj_different_value", () => {
    test_neq({ a: 1 }, { a: 2 })
})

test("obj_eq_obj_same_property_value", () => {
    test_eq({ a : 1 }, { a : 1 });
})

test("obj_eq_obj_same_nested_properties", () => {
    test_eq({ a : { b: 1 } }, { a : { b: 1 } })
})

test("obj_neq_obj_different_nested_property", () => {
    test_neq({ a: { b : 1 } }, { a: { c : 1 } })
})

test("obj_neq_obj_different_nested_property_value", () => {
    test_neq({ a : { b : 1 } }, { a : { b : 2 } })
})

test("string_eq_string", () => {
    test_eq("a", "a");
})

test("string_neq_string", () => {
    test_neq("a", "b");
})

test("empty_obj_neq_string", () => {
    test_neq({},"");
    test_neq({},"a");
})

test("empty_obj_neq_boolean", () => {
    test_neq({}, false);
    test_neq({}, true);
})

test("empty_obj_neq_null", () => {
    test_neq({}, null);
})

test("empty_obj_neq_undefined", () => {
    test_neq({}, undefined);
})

test("empty_obj_neq_number", () => {
    test_neq({}, 0);
    test_neq({}, 1);
})

test("objs_with_undefined_prop_values_eq", () => {
    test_eq({ a: undefined }, { a : undefined })
})

test("objs_with_null_prop_values_eq", () => {
    test_eq({ a : null }, { a : null })
})


function test_eq(a : Structural ,b : Structural) {
    expect(structuralEquals(a,b)).toBeTruthy()
    expect(structuralEquals(b,a)).toBeTruthy();
}

function test_neq(a : Structural, b : Structural) {
    expect(structuralEquals(a,b)).toBeFalsy()
    expect(structuralEquals(b,a)).toBeFalsy();    
}