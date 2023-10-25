import { asciiCharTo6Bit, calcFieldNum, firstAddrInPage, calcPageNum } from "../common";
import { SymbolToken } from "../lexer/Token";
import * as Nodes from "../parser/Node";
import { Parser } from "../parser/Parser";
import { PreludeEAE } from "../prelude/EAE";
import { PreludeFamily8 } from "../prelude/Family8";
import { PreludeIO } from "../prelude/IO";
import { Context } from "./Context";
import { LinkTable } from "./LinkTable";
import { SymbolData, SymbolTable, SymbolType } from "./SymbolTable";

export interface OutputHandler {
    setEnable(enable: boolean): void;
    changeOrigin(clc: number): void;
    changeField(field: number): void;
    writeValue(clc: number, val: number): void;
}

export class Assembler {
    private syms = new SymbolTable();
    private linkTable = new LinkTable();
    private programs: Nodes.Program[] = [];
    private outputHandler?: OutputHandler;

    private readonly pseudos = [
        // DEFINE and TEXT: handled by parser

        "NOPUNCH",  "ENPUNCH",
        "DECIMAL",  "OCTAL",
        "EXPUNGE",  "FIXTAB",
        "PAGE",     "FIELD",
        "DUBL",     "FLTG",
        "TEXT",     "ZBLOCK",
        "IFDEF",    "IFNDEF",   "IFNZRO",   "IFZERO",
    ];

    public constructor() {
        this.pseudos.forEach(p => this.syms.definePseudo(p));
        this.syms.definePermanent("I", 0o400);
        this.syms.definePermanent("Z", 0);

        this.loadPrelude();
    }

    public setOutputHandler(out: OutputHandler) {
        this.outputHandler = out;
        out.setEnable(false);
    }

    public parseInput(name: string, input: string): Nodes.Program {
        const parser = new Parser(name, input);
        const prog = parser.parseProgram();
        this.programs.push(prog);
        return prog;
    }

    public getSymbols(): SymbolData[] {
        return this.syms.getSymbols();
    }

    private loadPrelude() {
        this.parseInput("prelude/family8.pa", PreludeFamily8);
        this.parseInput("prelude/iot.pa", PreludeIO);
        this.parseInput("prelude/eae.pa", PreludeEAE);
    }

    public assembleAll() {
        const symCtx = this.createContext(false);
        this.programs.forEach(p => this.assignSymbols(symCtx, p));

        const asmCtx = this.createContext(true);
        this.outputHandler?.changeOrigin(asmCtx.clc);

        this.outputHandler?.setEnable(true);
        this.programs.forEach(p => this.assembleProgram(asmCtx, p));

        this.outputLinks(asmCtx);
    }

    private createContext(generateCode: boolean): Context {
        return {
            clc: 0o200,
            radix: 8,
            generateCode: generateCode,
        };
    }

    private assignSymbols(ctx: Context, prog: Nodes.Program) {
        for (const stmt of prog.stmts) {
            this.updateSymbols(ctx, stmt);
            this.updateCLC(ctx, stmt);
        }
    }

    private assembleProgram(ctx: Context, prog: Nodes.Program) {
        for (const stmt of prog.stmts) {
            switch (stmt.type) {
                case Nodes.NodeType.Text:
                    this.outputText(ctx, stmt.token.str);
                    break;
                case Nodes.NodeType.ExpressionStmt:
                    this.handleExprStmt(ctx, stmt);
                    break;
            }

            // symbols need to be updated here as well because it's possible to use
            // undefined symbols on the right hand side of A=B in pass 1
            this.updateSymbols(ctx, stmt);
            this.updateCLC(ctx, stmt);
        }
    }

    private updateSymbols(ctx: Context, stmt: Nodes.Statement) {
        switch (stmt.type) {
            case Nodes.NodeType.Assignment:
                const paramVal = this.eval(ctx, stmt.val);
                this.syms.defineParameter(stmt.sym.token.symbol, paramVal);
                break;
            case Nodes.NodeType.Label:
                this.syms.defineLabel(stmt.sym.token.symbol, ctx.clc);
                break;
            case Nodes.NodeType.Define:
                if (!ctx.generateCode) {
                    // define macros only once so we don't get duplicates in next pass
                    this.syms.defineMacro(stmt.name.token.symbol);
                }
                break;
            case Nodes.NodeType.Invocation: {
                this.handleSubProgram(ctx, stmt.program);
                break;
            }
            case Nodes.NodeType.ExpressionStmt:
                // need to handle pseudos because they can change the radix or CLC,
                // affecting expression parsing for symbol definitions
                if (this.isPseudoExpr(stmt.expr)) {
                    this.handlePseudo(ctx, stmt.expr as Nodes.SymbolGroup);
                }
                break;
        }
    }

    private handleExprStmt(ctx: Context, stmt: Nodes.ExpressionStatement) {
        if (!this.isPseudoExpr(stmt.expr)) {
            const val = this.eval(ctx, stmt.expr);
            this.outputHandler?.writeValue(ctx.clc, val);
        }
    }

    private convertMRI(ctx: Context, group: Nodes.SymbolGroup): number {
        const mri = this.syms.lookup(group.first.token.symbol);
        let mriVal = mri.value;
        let dst = 0;

        for (const ex of group.exprs) {
            if (ex.type == Nodes.NodeType.Symbol) {
                const sym = this.syms.tryLookup(ex.token.symbol);
                if (!sym) {
                    // using an undefined symbol doesn't matter here in pass 1, TSS8 actually does this
                    if (ctx.generateCode) {
                        throw Error(`Undefined MRI parameter ${ex.token.symbol}`);
                    }
                } else if (sym.type == SymbolType.Permanent) {
                    mriVal |= sym.value;
                } else {
                    dst |= sym.value;
                }
            } else {
                dst |= this.eval(ctx, ex);
            }
        }

        return this.genMRI(ctx, group, mriVal, dst);
    }

    private updateCLC(ctx: Context, stmt: Nodes.Statement) {
        switch (stmt.type) {
            case Nodes.NodeType.Origin:
                ctx.clc = this.eval(ctx, stmt.val);
                this.outputHandler?.changeOrigin(ctx.clc);
                break;
            case Nodes.NodeType.Text:
                ctx.clc += Math.ceil(stmt.token.str.length / 2);
                if (stmt.token.str.length % 2 == 0) {
                    // null terminator. For odd-length strings, part of last symbol.
                    ctx.clc++;
                }
                break;
            case Nodes.NodeType.ExpressionStmt:
                if (!this.isPseudoExpr(stmt.expr)) {
                    ctx.clc++;
                }
                break;
        }
    }

    // eslint-disable-next-line max-lines-per-function
    private handlePseudo(ctx: Context, group: Nodes.SymbolGroup) {
        const pseudo = this.syms.lookup(group.first.token.symbol).name;

        switch (pseudo) {
            case "DECIMA":
                ctx.radix = 10;
                break;
            case "OCTAL":
                ctx.radix = 8;
                break;
            case "FIXTAB":
                if (!ctx.generateCode) {
                    this.syms.fix();
                }
                break;
            case "FIELD":
                this.handleField(ctx, group);
                break;
            case "PAGE":
                this.handlePage(ctx, group);
                break;
            case "EXPUNG":
                this.syms.expunge();
                break;
            case "ZBLOCK":
                this.handleZeroBlock(ctx, group);
                break;
            case "IFNZRO":
            case "IFZERO":
            case "IFDEF":
            case "IFNDEF":
                this.handleCondition(ctx, group);
                break;
            case "NOPUNC":
                this.outputHandler?.setEnable(false);
                break;
            case "ENPUNC":
                if (ctx.generateCode) {
                    this.outputHandler?.setEnable(true);
                }
                break;
            case "DUBL":
            case "FLTG":
                throw Error("Unimplemented", {cause: group});
        }
    }

    private handleZeroBlock(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 1) {
            const num = this.eval(ctx, group.exprs[0]);
            for (let i = 0; i < num; i++) {
                if (ctx.generateCode) {
                    this.outputHandler?.writeValue(ctx.clc, 0);
                }
                ctx.clc++;
            }
        } else {
            throw Error("Expected one parameter for ZBLOCK", { cause: group });
        }
    }

    private handlePage(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 0) {
            // subtracting 1 because the cursor is already at the next statement
            const curPage = calcPageNum(ctx.clc - 1);
            ctx.clc = firstAddrInPage(calcFieldNum(ctx.clc), curPage + 1);
        } else if (group.exprs.length == 1) {
            const page = this.eval(ctx, group.exprs[0]);
            if (page < 0 || page > 31) {
                throw Error(`Invalid page ${page}`, { cause: group });
            }
            ctx.clc = firstAddrInPage(calcFieldNum(ctx.clc), page);
        } else {
            throw Error("Expected zero or one parameter for PAGE", { cause: group });
        }
        this.outputHandler?.changeOrigin(ctx.clc);
    }

    private handleField(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 1) {
            const field = this.eval(ctx, group.exprs[0]);
            if (field < 0 || field > 7) {
                throw Error(`Invalid field ${field}`, { cause: group });
            }
            ctx.clc = firstAddrInPage(field, 1);
            this.outputHandler?.changeField(field);
            this.outputHandler?.changeOrigin(ctx.clc);
        } else {
            throw Error("Expected one parameter for FIELD", { cause: group });
        }
    }

    private handleCondition(ctx: Context, group: Nodes.SymbolGroup) {
        const op = this.syms.lookup(group.first.token.symbol).name;

        if (op == "IFDEF" || op == "IFNDEF") {
            if (
                group.exprs.length != 2 ||
                group.exprs[0].type != Nodes.NodeType.Symbol ||
                group.exprs[1].type != Nodes.NodeType.MacroBody
            ) {
                throw Error("Invalid syntax: single symbol and body expected", {cause: group});
            }

            const sym = this.syms.tryLookup(group.exprs[0].token.symbol);
            if ((sym && op == "IFDEF") || (!sym && op == "IFNDEF")) {
                this.handleBody(ctx, group.exprs[1]);
            }
        } else if (op == "IFZERO" || op == "IFNZRO") {
            if (group.exprs.length != 2 || group.exprs[1].type != Nodes.NodeType.MacroBody) {
                throw Error("Invalid syntax: single expression and body expected", {cause: group});
            }
            const val = this.eval(ctx, group.exprs[0]);
            if ((val != 0 && op == "IFNZRO") || (val == 0 && op == "IFZERO")) {
                this.handleBody(ctx, group.exprs[1]);
            }
        }
    }

    private handleBody(ctx: Context, body: Nodes.MacroBody) {
        if (!body.parsed) {
            const parser = new Parser(body.token.cursor.inputName, body.token.body);
            body.parsed = parser.parseProgram();
        }

        this.handleSubProgram(ctx, body.parsed);
    }

    private handleSubProgram(ctx: Context, program: Nodes.Program) {
        if (!ctx.generateCode) {
            this.assignSymbols(ctx, program);
        } else {
            this.assembleProgram(ctx, program);
        }
    }

    // eslint-disable-next-line max-lines-per-function
    private eval(ctx: Context, expr: Nodes.Expression): number {
        switch (expr.type) {
            case Nodes.NodeType.Integer:
                if (ctx.radix == 8 && !expr.token.value.match(/^[0-7]+$/)) {
                    throw Error("Invalid digit in OCTAL", {cause: expr});
                }
                return Number.parseInt(expr.token.value, ctx.radix) & 0o7777;
            case Nodes.NodeType.ASCIIChar:
                return (expr.token.char.charCodeAt(0) & 0o7777) | 0o200;
            case Nodes.NodeType.Symbol:
                return this.evalSymbol(ctx, expr.token);
            case Nodes.NodeType.CLCValue:
                return ctx.clc;
            case Nodes.NodeType.UnaryOp:
                if (expr.operator == "-") {
                    return (-this.eval(ctx, expr.elem)) & 0o7777;
                } else if (expr.operator == "+") {
                    return this.eval(ctx, expr.elem);
                } else {
                    throw Error(`Unsupported unary '${expr.operator}'`);
                }
            case Nodes.NodeType.ParenExpr:
                return this.evalParenExpr(ctx, expr);
            case Nodes.NodeType.SymbolGroup:
                if (this.isMRIExpr(expr)) {
                    return this.convertMRI(ctx, expr);
                } else {
                    const init = this.eval(ctx, expr.first);
                    return expr.exprs.reduce((acc, cur) => acc | this.eval(ctx, cur), init);
                }
            case Nodes.NodeType.BinaryOp:
                return this.evalBinOp(ctx, expr);
            case Nodes.NodeType.MacroBody:
                throw Error("Trying to evaluate macbody body", {cause: expr});
        }
    }

    private evalSymbol(ctx: Context, symTok: SymbolToken): number {
        const sym = this.syms.tryLookup(symTok.symbol);
        if (sym) {
            if (sym.type == SymbolType.Macro || sym.type == SymbolType.Pseudo) {
                throw Error("Macro and pseudo symbols not allowed here", {cause: symTok});
            }
            return sym.value;
        } else if (!ctx.generateCode) {
            // Used in TSS8 - this is potentially dangerous because it could be used in an IFNZRO that generaes code,
            // thereby changing the CLCs of pass 1 vs pass 2
            console.warn(`Access to undefined symbol ${symTok.symbol}, assuming 0 in pass 1 - this is dangerous!`);
            return 0;
        } else {
            throw Error(`Undefined symbol: ${symTok.symbol}`, {cause: symTok});
        }
    }

    private evalParenExpr(ctx: Context, expr: Nodes.ParenExpr): number {
        const val = this.eval(ctx, expr.expr);
        if (expr.paren == "(") {
            const curPage = calcPageNum(ctx.clc);
            const link = this.linkTable.enter(calcFieldNum(ctx.clc), curPage, val);
            return link;
        } else if (expr.paren == "[") {
            const link = this.linkTable.enter(calcFieldNum(ctx.clc), 0, val);
            return link;
        } else {
            throw Error(`Invalid parentheses: "${expr.paren}"`, {cause: expr});
        }
    }

    private evalBinOp(ctx: Context, binOp: Nodes.BinaryOp): number {
        const lhs = this.eval(ctx, binOp.lhs);
        const rhs = this.eval(ctx, binOp.rhs);

        switch (binOp.operator) {
            case "+":   return (lhs + rhs) & 0o7777;
            case "-":   return (lhs - rhs) & 0o7777;
            case "^":   return (lhs * rhs) & 0o7777;
            case "%":   return (lhs / rhs) & 0o7777;
            case "!":   return lhs | rhs;
            case "&":   return lhs & rhs;
        }
    }

    private isPseudoExpr(expr: Nodes.Expression): boolean {
        if (expr.type != Nodes.NodeType.SymbolGroup) {
            return false;
        }
        const sym = this.syms.tryLookup(expr.first.token.symbol);
        if (!sym) {
            return false;
        }
        return sym.type == SymbolType.Pseudo;
    }

    private isMRIExpr(expr: Nodes.Expression): boolean {
        // An MRI expression needs to start with an MRI op followed by a space -> group
        if (expr.type != Nodes.NodeType.SymbolGroup) {
            return false;
        }

        const sym = this.syms.tryLookup(expr.first.token.symbol);
        if (!sym || sym.type != SymbolType.Fixed) {
            return false;
        }

        // We've got a fixed symbol, now check if it's a MRI
        return ((sym.value & 0o777) == 0) && (sym.value <= 0o5000);
    }

    private genMRI(ctx: Context, group: Nodes.SymbolGroup, mri: number, dst: number): number {
        const IND   = 0b000100000000;
        const CUR   = 0b000010000000;

        const effVal = mri | (dst & 0b1111111);

        const curField = calcFieldNum(ctx.clc);
        const curPage = calcPageNum(ctx.clc);
        const dstPage = calcPageNum(dst);
        if (dstPage == 0) {
            return effVal;
        } else if (curPage == dstPage) {
            return effVal | CUR;
        } else if (this.linkTable.has(curField, 0, dst)) {
            if (mri & IND) {
                throw Error("Double indirection on zero page", {cause: group});
            }
            const indAddr = this.linkTable.enter(curField, 0, dst);
            return mri | (indAddr & 0b1111111) | IND;
        } else {
            if (mri & IND) {
                throw Error("Double indirection on current page", {cause: group});
            }
            const indAddr = this.linkTable.enter(curField, curPage, dst);
            return mri | (indAddr & 0b1111111) | IND | CUR;
        }
    }

    private outputLinks(ctx: Context) {
        this.linkTable.visit((field, addr, val) => {
            // TODO change fields
            this.outputHandler?.writeValue(addr, val);
        });
    }

    /**
     * Output ASCII text as 6bit text
     * @param ctx current context
     * @param text text in ASCII
     */
    private outputText(ctx: Context, text: string) {
        let loc = ctx.clc;
        for (let i = 0; i < text.length - 1; i += 2) {
            const left = asciiCharTo6Bit(text[i]);
            const right = asciiCharTo6Bit(text[i + 1]);
            this.outputHandler?.writeValue(loc, (left << 6) | right);
            loc++;
        }
        if (text.length % 2 == 0) {
            this.outputHandler?.writeValue(loc, 0);
        } else {
            const left = asciiCharTo6Bit(text[text.length - 1]);
            this.outputHandler?.writeValue(loc, left << 6);
        }
    }
}
