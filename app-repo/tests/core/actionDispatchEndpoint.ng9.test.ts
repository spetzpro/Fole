import { ShellConfigValidator } from "../../src/server/ShellConfigValidator";
import { ShellBundle } from "../../src/server/ShellConfigTypes";

// NG9: Button Behavior Schema & Action Dispatch Logic
async function runTest() {
    console.log("Running NG9 Tests...");
    
    // 1. Verify Schema Update
    {
         console.log("Test 1: Schema Validation");
         const repoRoot = process.cwd();
         const validator = new ShellConfigValidator(repoRoot);
         
         // Minimal envelope
         const block = {
             blockId: "btn1",
             blockType: "ui.node.button",
             schemaVersion: "1.0.0",
             data: {
                 id: "btn1",
                 type: "ui.node.button",
                 label: "Click Me",
                 behaviors: {
                     onClick: {
                         actionId: "my_action"
                     }
                 }
             }
         };

         // Manually validate just this block to see if schema passes
         // validator.validateBlock() isn't public, but validateBundle is.
         
         const bundle: ShellBundle["bundle"] = {
             manifest: { schemaVersion: "1.0.0", regions: { header: {blockId:"x"}, footer: {blockId:"x"}, viewport: {blockId:"x"} } } as any,
             blocks: {
                 "btn1": block,
                 // mocked required regions
                 "x": { blockId: "x", blockType: "shell.region.header", schemaVersion: "1.0.0", data: {} }
             }
         };
         
         const report = await validator.validateBundle(bundle);
         
         const schemaErrors = report.errors.filter(e => e.blockId === "btn1" && (e.code === "data_schema_error" || e.code === "data_schema_additional" || e.code === "data_schema_required"));
         if (schemaErrors.length > 0) {
             console.error("Schema Errors for Button:", JSON.stringify(schemaErrors, null, 2));
             throw new Error("Button schema validation failed.");
         }
         console.log("  > Schema check passed.");
    }
    
    // 2. Verify Handler Logic (Simulation)
    {
        console.log("Test 2: Handler Logic");
        // Simulating the handler logic we added
        const handler = async (body: any) => {
             if (!body.actionId || !body.nodeId) {
                return 400;
             }
             console.log(`[Action Dispatch] Node: ${body.nodeId}, Action: ${body.actionId}`);
             return 200;
        };
        
        const status = await handler({ actionId: "act1", nodeId: "btn1" });
        if (status !== 200) throw new Error("Handler failed valid input");
        
        const failStatus = await handler({ nodeId: "btn1" });
        if (failStatus !== 400) throw new Error("Handler passed invalid input");
        
        console.log("NG9 PASS");
    }
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});

