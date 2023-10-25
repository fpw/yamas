import { asciiCharTo6Bit, calcFieldNum, calcPageNum, firstAddrInPage, parseIntSafe, to7BitAscii } from "../common";
import * as Nodes from "../parser/Node";
import { Parser } from "../parser/Parser";
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
                const paramVal = this.tryEval(ctx, stmt.val);
                // undefined expressions lead to undefined symbols
                if (paramVal !== null) {
                    this.syms.defineParameter(stmt.sym.token.symbol, paramVal);
                }
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
            const val = this.safeEval(ctx, stmt.expr);
            this.outputHandler?.writeValue(ctx.clc, val);
        }
    }

    private updateCLC(ctx: Context, stmt: Nodes.Statement) {
        switch (stmt.type) {
            case Nodes.NodeType.Origin:
                ctx.clc = this.safeEval(ctx, stmt.val);
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
                if (!ctx.generateCode) {
                    this.syms.expunge();
                }
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
                throw this.error("Unimplemented", group);
        }
    }

    private handleZeroBlock(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 1) {
            const num = this.safeEval(ctx, group.exprs[0]);
            for (let i = 0; i < num; i++) {
                if (ctx.generateCode) {
                    this.outputHandler?.writeValue(ctx.clc, 0);
                }
                ctx.clc++;
            }
        } else {
            throw this.error("Expected one parameter for ZBLOCK", group);
        }
    }

    private handlePage(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 0) {
            // subtracting 1 because the cursor is already at the next statement
            const curPage = calcPageNum(ctx.clc - 1);
            ctx.clc = firstAddrInPage(calcFieldNum(ctx.clc), curPage + 1);
        } else if (group.exprs.length == 1) {
            const page = this.safeEval(ctx, group.exprs[0]);
            if (page < 0 || page > 31) {
                throw this.error(`Invalid page ${page}`, group);
            }
            ctx.clc = firstAddrInPage(calcFieldNum(ctx.clc), page);
        } else {
            throw this.error("Expected zero or one parameter for PAGE", group);
        }
        this.outputHandler?.changeOrigin(ctx.clc);
    }

    private handleField(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 1) {
            const field = this.safeEval(ctx, group.exprs[0]);
            if (field < 0 || field > 7) {
                throw this.error(`Invalid field ${field}`, group);
            }
            ctx.clc = firstAddrInPage(field, 1);
            this.outputHandler?.changeField(field);
            this.outputHandler?.changeOrigin(ctx.clc);
        } else {
            throw this.error("Expected one parameter for FIELD", group);
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
                throw this.error("Invalid syntax: single symbol and body expected", group);
            }

            const sym = this.syms.tryLookup(group.exprs[0].token.symbol);
            if ((sym && op == "IFDEF") || (!sym && op == "IFNDEF")) {
                this.handleBody(ctx, group.exprs[1]);
            }
        } else if (op == "IFZERO" || op == "IFNZRO") {
            if (group.exprs.length != 2 || group.exprs[1].type != Nodes.NodeType.MacroBody) {
                throw this.error("Invalid syntax: single expression and body expected", group);
            }
            const val = this.safeEval(ctx, group.exprs[0]);
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

    private safeEval(ctx: Context, expr: Nodes.Expression): number {
        const val = this.tryEval(ctx, expr);
        if (val === null) {
            throw this.error("Cant't use undefined expression here", expr);
        }
        return val;
    }

    private tryEval(ctx: Context, expr: Nodes.Expression): number | null {
        switch (expr.type) {
            case Nodes.NodeType.Integer:
                return parseIntSafe(expr.token.value, ctx.radix) & 0o7777;
            case Nodes.NodeType.ASCIIChar:
                return to7BitAscii(expr.token.char, true);
            case Nodes.NodeType.Symbol:
                return this.evalSymbol(ctx, expr);
            case Nodes.NodeType.CLCValue:
                return ctx.clc;
            case Nodes.NodeType.UnaryOp:
                return this.evalUnary(ctx, expr);
            case Nodes.NodeType.ParenExpr:
                return this.evalParenExpr(ctx, expr);
            case Nodes.NodeType.SymbolGroup:
                return this.evalSymbolGroup(ctx, expr);
            case Nodes.NodeType.BinaryOp:
                return this.evalBinOp(ctx, expr);
            case Nodes.NodeType.MacroBody:
                throw this.error("Trying to evaluate macro body", expr);
        }
    }

    private evalSymbol(ctx: Context, node: Nodes.SymbolNode): number | null {
        const sym = this.syms.tryLookup(node.token.symbol);
        if (!sym) {
            return null;
        }
        if (sym.type == SymbolType.Macro || sym.type == SymbolType.Pseudo) {
            throw this.error("Macro and pseudo symbols not allowed here", node);
        }
        return sym.value;
    }

    private evalSymbolGroup(ctx: Context, group: Nodes.SymbolGroup): number | null {
        if (this.isMRIExpr(group)) {
            return this.evalMRI(ctx, group);
        } else {
            let acc = this.tryEval(ctx, group.first);
            for (const e of group.exprs) {
                const val = this.tryEval(ctx, e);
                if (val === null || acc === null) {
                    acc = null;
                } else {
                    acc |= val;
                }
            }
            return acc;
        }
    }

    private evalMRI(ctx: Context, group: Nodes.SymbolGroup): number | null {
        const mri = this.syms.lookup(group.first.token.symbol);
        let mriVal = mri.value;
        let dst = 0;

        for (const ex of group.exprs) {
            if (ex.type == Nodes.NodeType.Symbol) {
                const sym = this.syms.tryLookup(ex.token.symbol);
                if (!sym) {
                    return null;
                } else if (sym.type == SymbolType.Permanent) {
                    mriVal |= sym.value;
                } else {
                    dst |= sym.value;
                }
            } else {
                const val = this.tryEval(ctx, ex);
                if (val === null) {
                    return null;
                }
                dst |= val;
            }
        }

        return this.genMRI(ctx, group, mriVal, dst);
    }

    private evalParenExpr(ctx: Context, expr: Nodes.ParenExpr): number | null {
        const val = this.tryEval(ctx, expr.expr);
        if (val === null) {
            return null;
        }

        if (expr.paren == "(") {
            const curPage = calcPageNum(ctx.clc);
            const link = this.linkTable.enter(calcFieldNum(ctx.clc), curPage, val);
            return link;
        } else if (expr.paren == "[") {
            const link = this.linkTable.enter(calcFieldNum(ctx.clc), 0, val);
            return link;
        } else {
            throw this.error(`Invalid parentheses: "${expr.paren}"`, expr);
        }
    }

    private evalUnary(ctx: Context, unary: Nodes.UnaryOp): number | null {
        const val = this.tryEval(ctx, unary.elem);
        if (val === null) {
            return null;
        }

        switch (unary.operator) {
            case "+":   return val & 0o7777;
            case "-":   return (-val & 0o7777);
        }
    }

    private evalBinOp(ctx: Context, binOp: Nodes.BinaryOp): number | null {
        const lhs = this.tryEval(ctx, binOp.lhs);
        const rhs = this.tryEval(ctx, binOp.rhs);

        if (lhs === null || rhs === null) {
            return null;
        }

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
                throw this.error("Double indirection on zero page", group);
            }
            const indAddr = this.linkTable.enter(curField, 0, dst);
            return mri | (indAddr & 0b1111111) | IND;
        } else {
            if (mri & IND) {
                throw this.error("Double indirection on current page", group);
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

    private error(msg: string, node: Nodes.Node) {
        return Parser.mkNodeError(msg, node);
    }
}
