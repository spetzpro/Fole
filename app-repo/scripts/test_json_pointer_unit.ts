
import { JsonPointer } from "../src/server/JsonPointer";
import * as assert from "assert";

console.log("Running JsonPointer Unit Tests...");

// Test Case 1: Set value on existing structure (Regression check)
{
    const data = { a: { b: 1 } };
    JsonPointer.setByPointer(data, "/a/b", 2);
    assert.strictEqual(data.a.b, 2, "Failed: Should update existing value");
    console.log("PASS: Update existing value");
}

// Test Case 2: Set value with missing intermediate object (The fix)
{
    const data: any = { a: {} };
    JsonPointer.setByPointer(data, "/a/b/c", 3);
    assert.strictEqual(data.a.b.c, 3, "Failed: Should create intermediate objects");
    console.log("PASS: Create intermediate objects");
}

// Test Case 3: Set value at root (Invalid generally, but check safety)
{
    const data = { a: 1 };
    JsonPointer.setByPointer(data, "", 2);
    assert.strictEqual(data.a, 1, "Failed: Should not affect root if pointer empty");
    console.log("PASS: Empty pointer safety");
}

// Test Case 4: Get value (Regression check)
{
    const data = { a: { b: { c: 4 } } };
    const val = JsonPointer.getByPointer(data, "/a/b/c");
    assert.strictEqual(val, 4, "Failed: Should retrieve value");
    console.log("PASS: Get value");
}

// Test Case 5: Get missing value (Regression check)
{
    const data = { a: 1 };
    const val = JsonPointer.getByPointer(data, "/b/c");
    assert.strictEqual(val, undefined, "Failed: Should return undefined for missing path");
    console.log("PASS: Get missing value");
}

console.log("All JsonPointer tests passed.");
