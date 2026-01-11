
import { evaluateExpression, evaluateBoolean, ExpressionContext } from "../src/server/ExpressionEvaluator";

function runTests() {
    console.log("Starting Expression Evaluator Tests...");

    const ctx: ExpressionContext = {
        permissions: new Set(["read:docs", "write:comments"]),
        roles: new Set(["editor"]),
        ui: { isSidebarOpen: true, theme: "dark" },
        data: { itemCount: 5, status: "active" }
    };

    let passed = 0;
    let failed = 0;

    function assert(name: string, expr: any, expected: any) {
        const actual = evaluateExpression(expr, ctx);
        if (actual === expected) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name} - Expected ${expected}, got ${actual}`);
            failed++;
        }
    }

    function assertBool(name: string, expr: any, expected: boolean) {
        const actual = evaluateBoolean(expr, ctx);
        if (actual === expected) {
            console.log(`✅ PASS: ${name} (Bool)`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name} (Bool) - Expected ${expected}, got ${actual}`);
            failed++;
        }
    }

    // 1. Literals
    assert("Literal True", { kind: "literal", value: true }, true);
    assert("Literal Number", { kind: "literal", value: 123 }, 123);
    assert("Literal Null", { kind: "literal", value: null }, null);

    // 2. Refs
    assert("Ref Permissions (Valid)", { kind: "ref", refType: "permission", key: "read:docs" }, true);
    assert("Ref Permissions (Invalid)", { kind: "ref", refType: "permission", key: "delete:db" }, false);
    assert("Ref UI State", { kind: "ref", refType: "uiState", key: "theme" }, "dark");
    assert("Ref Missing", { kind: "ref", refType: "uiState", key: "missing" }, null);

    // 3. Logic
    assert("AND (True)", { 
        kind: "and", 
        exprs: [
            { kind: "literal", value: true },
            { kind: "ref", refType: "role", key: "editor" }
        ] 
    }, true);
    
    assert("AND (False)", { 
        kind: "and", 
        exprs: [
            { kind: "literal", value: true },
            { kind: "literal", value: false }
        ] 
    }, false);

    assert("OR (True)", { 
        kind: "or", 
        exprs: [
            { kind: "literal", value: false },
            { kind: "ref", refType: "permission", key: "read:docs" }
        ] 
    }, true);

    assert("NOT (True)", { kind: "not", expr: { kind: "literal", value: false } }, true);
    assert("NOT (Invalid Type)", { kind: "not", expr: { kind: "literal", value: "string" } }, null); // Fail-closed

    // 4. Comparison
    assert("CMP ==", { kind: "cmp", op: "==", left: { kind: "literal", value: 5 }, right: { kind: "literal", value: 5 } }, true);
    assert("CMP >", { kind: "cmp", op: ">", left: { kind: "literal", value: 10 }, right: { kind: "literal", value: 5 } }, true);
    assert("CMP Type Mismatch", { kind: "cmp", op: "==", left: { kind: "literal", value: 5 }, right: { kind: "literal", value: "5" } }, false);

    // 5. In / Set
    assert("IN (True)", { 
        kind: "in", 
        item: { kind: "literal", value: "b" },
        set: [
            { kind: "literal", value: "a" },
            { kind: "literal", value: "b" }
        ]
    }, true);

    // 6. Exists
    assert("Exists (True)", { kind: "exists", expr: { kind: "ref", refType: "uiState", key: "theme" } }, true);
    assert("Exists (False)", { kind: "exists", expr: { kind: "ref", refType: "uiState", key: "missing" } }, false);

    // 7. Limits & Safety
    // Create deep object
    let deepNode: any = { kind: "literal", value: true };
    for(let i=0; i<25; i++) {
        deepNode = { kind: "not", expr: deepNode };
    }
    assert("Depth Limit Exceeded", deepNode, null); // Should default to null/fail due to depth

    console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
