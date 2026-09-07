import { Token } from "../lexer/token.types";
import { AstNode } from "./ast.types";
export declare class TemplateParseError extends Error {
    line: number;
    col: number;
    raw: string;
    constructor(message: string, line: number, col: number, raw: string);
}
export declare class Parser {
    private tokens;
    private pos;
    parse(tokens: Token[]): AstNode[];
    private parseBlock;
    private parseNode;
    private parseText;
    private parseVariable;
    private parseAi;
    private parseSeo;
    private parseSchema;
    private parseImage;
    private parseIf;
    private parseUnless;
    private parseEach;
    private expectClose;
    private peek;
    private advance;
    private isAtEnd;
}
//# sourceMappingURL=parser.d.ts.map