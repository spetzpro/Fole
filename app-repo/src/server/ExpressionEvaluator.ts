
export type ExpressionValue = boolean | number | string | null;

export interface ExpressionContext {
    permissions: Set<string>;
    roles: Set<string>;
    ui: Record<string, any>;
    data: Record<string, any>;
}

const MAX_DEPTH = 20;
const MAX_NODE_COUNT = 100;

interface EvalState {
    depth: number;
    count: number;
}

export function evaluateBoolean(expr: any, ctx: ExpressionContext): boolean {
    const result = evaluateExpression(expr, ctx);
    return result === true;
}

export function evaluateExpression(expr: any, ctx: ExpressionContext): ExpressionValue {
    const state: EvalState = { depth: 0, count: 0 };
    try {
        return evalRecursive(expr, ctx, state);
    } catch (e) {
        // Fail-closed on any exception
        return null;
    }
}

function evalRecursive(node: any, ctx: ExpressionContext, state: EvalState): ExpressionValue {
    // 1. Safety Limits
    state.count++;
    state.depth++;
    
    if (state.count > MAX_NODE_COUNT) return null; // Logic: fail-closed -> null usually evaluates to false in bool context
    if (state.depth > MAX_DEPTH) {
        state.depth--;
        return null;
    }

    // 2. Shape Validation
    if (!node || typeof node !== "object" || !node.kind) {
        state.depth--;
        return null; // Invalid node
    }

    let result: ExpressionValue = null;

    switch (node.kind) {
        case "literal":
            // Valid values: string, number, boolean, null
            result = node.value ?? null; // Undefined becomes null
            break;

        case "ref":
            if (!node.key || typeof node.key !== "string") break;
            
            switch (node.refType) {
                case "permission":
                    result = ctx.permissions.has(node.key);
                    break;
                case "role":
                    result = ctx.roles.has(node.key);
                    break;
                case "uiState":
                    result = ctx.ui[node.key] ?? null;
                    break;
                case "surfaceState":
                    result = ctx.data[node.key] ?? null;
                    break;
                default:
                    result = null; // Unknown refType
            }
            break;

        case "not":
            const operand = evalRecursive(node.expr, ctx, state);
            // Strict boolean negation? Or Truthy? Spec implies strict typing roughly, 
            // but fail-closed usually implies null -> false -> not null -> true is dangerous.
            // Let's stick to standard truthy/falsy JS semantics wrapped safely, 
            // OR enforce boolean type. 
            // Given "Fail-Closed", if operand is not boolean, return null?
            // "Declarative, typed" -> let's try to be strict.
            if (typeof operand === "boolean") {
                result = !operand;
            } else {
                // If it's not a boolean, 'not' is ambiguous in strict system. 
                // Defaulting to false (null) is safest.
                result = null;
            }
            break;

        case "and":
            if (Array.isArray(node.exprs)) {
                let valid = true;
                for (const subExpr of node.exprs) {
                    const val = evalRecursive(subExpr, ctx, state);
                    if (val !== true) { // Strict true? Or Truthy?
                        // Spec says "boolean or value-based logic".
                        // Logic gates usually imply boolean.
                        valid = false; 
                        break; 
                    }
                }
                result = valid;
            } else {
                result = null;
            }
            break;

        case "or":
             if (Array.isArray(node.exprs)) {
                let valid = false;
                for (const subExpr of node.exprs) {
                    const val = evalRecursive(subExpr, ctx, state);
                    if (val === true) {
                        valid = true; 
                        break; 
                    }
                }
                result = valid;
            } else {
                result = null;
            }
            break;

        case "cmp":
            const left = evalRecursive(node.left, ctx, state);
            const right = evalRecursive(node.right, ctx, state);

            // Fail-closed type checking
            const typeL = typeof left;
            const typeR = typeof right;

            if (left === null || right === null) {
                // Null comparisons usually false unless checking equality
                 if (node.op === "==") result = (left === right);
                 else if (node.op === "!=") result = (left !== right);
                 else result = false;
            }
            else if (typeL !== typeR) {
                // Mismatched types => false (fail-closed)
                result = false;
            } else {
                switch (node.op) {
                    case "==": result = left === right; break;
                    case "!=": result = left !== right; break;
                    case "<": result = (left as any) < (right as any); break;
                    case "<=": result = (left as any) <= (right as any); break;
                    case ">": result = (left as any) > (right as any); break;
                    case ">=": result = (left as any) >= (right as any); break;
                    default: result = false;
                }
            }
            break;

        case "in":
            const item = evalRecursive(node.item, ctx, state);
            // set can be an array literal OR a ref resolving to an array
            // The AST schema says definitions/set/properties/set is oneOf expression or array of expressions.
            // If it's an array of AST nodes:
            if (Array.isArray(node.set)) {
                 result = false;
                 // It's an array of Expressions, evaluate them
                 for (const setItemExpr of node.set) {
                     const setItemVal = evalRecursive(setItemExpr, ctx, state);
                     if (setItemVal === item && item !== null) {
                         result = true;
                         break;
                     }
                 }
            } 
            // If it is a reference/expression that resolves to an array:
            else {
                 // Evaluating 'set' as an expression is risky if the AST schema allows it to be a ref.
                 // The schema allows it.
                 // However, return type of evalRecursive is atomic (bool|num|str|null).
                 // It does NOT return arrays. 
                 // So generic `in` reference support is limited by our ExpressionValue definition.
                 // For now, fail-closed if 'set' is not a literal AST array property.
                 result = false;
            }
            break;

        case "exists":
            // Check if inner expr is not null
            const existsVal = evalRecursive(node.expr, ctx, state);
            result = (existsVal !== null && existsVal !== undefined);
            break;

        default:
            result = null;
    }

    state.depth--;
    return result;
}
