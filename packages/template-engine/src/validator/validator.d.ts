import { AstNode } from "../parser/ast.types";
export interface ValidationError {
    message: string;
    path: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    requiredVariables: Set<string>;
    aiPlaceholders: Set<string>;
}
export declare class Validator {
    validate(ast: AstNode[], knownVariables?: Set<string> | null): ValidationResult;
    private walkNodes;
}
//# sourceMappingURL=validator.d.ts.map