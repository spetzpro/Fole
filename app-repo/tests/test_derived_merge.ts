import { mergeDerivedProps } from "../../app-ui/src/lib/derivedState.ts";

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
}

function runTest() {
    console.log("Running Derived Merge Test...");

    const baseProps = { label: "Sysadmin Action" };
    const derivedState = {
        "sys-button": { label: "Hello Sysadmin World" }
    };

    const effective = mergeDerivedProps(baseProps, derivedState, "sys-button", { id: "sys-button" });
    assert(effective.label === "Hello Sysadmin World", "Expected derived label to override base label");

    const fallback = mergeDerivedProps(baseProps, {}, "sys-button", { id: "sys-button" });
    assert(fallback.label === "Sysadmin Action", "Expected base label when no patch exists");

    console.log("SUCCESS: Derived patch merge behavior verified.");
    process.exit(0);
}

runTest();
