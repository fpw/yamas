import { Context } from "./Context";
import { LinkTable } from "./LinkTable";
import { SymbolTable, SymbolType } from "./SymbolTable";
import { Lexer } from "../lexer/Lexer";
import { AstNodeType, BinaryOp, Expression, ExpressionStatement, Program, Statement, SymbolGroup, UnparsedSequence } from "../parser/AST";
import { Parser } from "../parser/Parser";
import { PreludeEAE } from "../prelude/EAE";
import { PreludeFamily8 } from "../prelude/Family8";
import { PreludeIO } from "../prelude/IO";

export class Assembler {
    private lexer = new Lexer();
    private syms = new SymbolTable();
    private linkTable = new LinkTable();

    private readonly pseudos = [
        "NOPUNCH",  "ENPUNCH",
        "DECIMAL",  "OCTAL",
        "EXPUNGE",  "FIXTAB",
        "PAGE",     "FIELD",
        "DUBL",     "FLTG",
        "TEXT",     "ZBLOCK",
        "IFDEF",    "IFNDEF",   "IFNZRO",   "IFZERO",
        "DEFINE",
    ];

    public constructor() {
        this.pseudos.forEach(p => this.syms.definePseudo(p));
        this.syms.definePermanent("I", 0o400);
        this.syms.definePermanent("Z", 0);

        this.loadPrelude();
    }

    private loadPrelude() {
        const preLexer = new Lexer();
        preLexer.addInput("family8.per", PreludeFamily8);
        preLexer.addInput("io.per", PreludeIO);
        preLexer.addInput("eae.per", PreludeEAE);

        const parser = new Parser(preLexer);
        const prelude = parser.run();
        const ctx = this.createContext(false);
        this.assignSymbols(ctx, prelude);
    }

    public addFile(name: string, content: string) {
        this.lexer.addInput(name, content);
    }

    public run() {
        const parser = new Parser(this.lexer);

        const ast = parser.run();

        const symCtx = this.createContext(false);
        this.assignSymbols(symCtx, ast);

        const asmCtx = this.createContext(true);
        this.assemble(asmCtx, ast);

        if (true) {
            this.outputSymbols(asmCtx);
            this.outputLinks(asmCtx);
        }
    }

    private output(ctx: Context, field: number, clc: number, value: number) {
        if (ctx.punchEnabled) {
            console.log(`${field}${clc.toString(8).padStart(4, "0")} ${value.toString(8).padStart(4, "0")}`);
        }
    }

    private createContext(generateCode: boolean): Context {
        return {
            field: 0,
            clc: 0o200,
            radix: 8,
            punchEnabled: true,
            generateCode: generateCode,
        };
    }

    private assignSymbols(ctx: Context, prog: Program) {
        for (const stmt of prog.stmts) {
            this.updateSymbols(ctx, stmt);
            this.updateCLC(ctx, stmt);
        }
    }

    private assemble(ctx: Context, prog: Program) {
        for (const stmt of prog.stmts) {
            switch (stmt.type) {
                case AstNodeType.Text:
                    let loc = ctx.clc;
                    const text = stmt.token.text;
                    for (let i = 0; i < text.length - 1; i += 2) {
                        const left = this.to6Bit(text[i]);
                        const right = this.to6Bit(text[i + 1]);
                        this.output(ctx, ctx.field, loc, (left << 6) | right);
                        loc++;
                    }
                    if (text.length % 2 == 0) {
                        this.output(ctx, ctx.field, loc, 0);
                    } else {
                        const left = this.to6Bit(text[text.length - 1]);
                        this.output(ctx, ctx.field, loc, left << 6);
                    }
                    break;
                case AstNodeType.ExpressionStmt:
                    this.handleExprStmt(ctx, stmt);
                    break;
            }

            // symbols need to be updated here as well because it's possible to use
            // undefined symbols on the right hand side of A=B in pass 1
            this.updateSymbols(ctx, stmt);
            this.updateCLC(ctx, stmt);
        }
    }

    private updateSymbols(ctx: Context, stmt: Statement) {
        switch (stmt.type) {
            case AstNodeType.Assignment:
                const paramVal = this.eval(ctx, stmt.val);
                this.syms.defineParameter(stmt.sym.token.symbol, paramVal);
                break;
            case AstNodeType.Label:
                this.syms.defineLabel(stmt.sym.token.symbol, ctx.clc);
                break;
            case AstNodeType.ExpressionStmt:
                // need to handle pseudos because they can change the radix or CLC,
                // affecting expression parsing for symbol definitions
                if (this.isPseudoExpr(stmt.expr)) {
                    this.handlePseudo(ctx, stmt.expr);
                }
                break;
        }
    }

    private to6Bit(str: string): number {
        const val = str.charCodeAt(0);
        return val & 0o77;
    }

    private handleExprStmt(ctx: Context, stmt: ExpressionStatement) {
        if (this.isPseudoExpr(stmt.expr)) {
            // this is handled by updateSymbols which is called in both symbol and assembly phases
        } else if (this.isMRIExpr(stmt.expr)) {
            this.handleLoadMRI(ctx, stmt.expr);
        } else {
            const val = this.eval(ctx, stmt.expr);
            this.output(ctx, ctx.field, ctx.clc, val);
        }
    }

    private handleLoadMRI(ctx: Context, expr: SymbolGroup) {
        const mri = this.syms.lookup(expr.first.token.symbol);
        let mriVal = mri.value;
        let dst = 0;

        for (const ex of expr.exprs) {
            if (ex.type == AstNodeType.Symbol) {
                const sym = this.syms.lookup(ex.token.symbol);
                if (sym.type == SymbolType.Permanent) {
                    mriVal |= sym.value;
                } else {
                    dst |= sym.value;
                }
            } else {
                dst |= this.eval(ctx, ex);
            }
        }

        const effVal = this.genMRI(ctx, expr, mriVal, dst);
        this.output(ctx, ctx.field, ctx.clc, effVal);
    }

    private updateCLC(ctx: Context, stmt: Statement) {
        switch (stmt.type) {
            case AstNodeType.Origin:
                ctx.clc = this.eval(ctx, stmt.val);;
                break;
            case AstNodeType.Text:
                ctx.clc += Math.ceil(stmt.token.text.length / 2);
                if (stmt.token.text.length % 2 == 0) {
                    // null terminator. For odd-length strings, part of last symbol.
                    ctx.clc++;
                }
                break;
            case AstNodeType.ExpressionStmt:
                if (!this.isPseudoExpr(stmt.expr)) {
                    ctx.clc++;
                }
                break;
        }
    }

    private handlePseudo(ctx: Context, expr: SymbolGroup) {
        const name = this.syms.lookup(expr.first.token.symbol).name;

        switch (name) {
            case "DECIMA":
                ctx.radix = 10;
                break;
            case "OCTAL":
                ctx.radix = 8;
                break;
            case "FIXTAB":
                this.syms.fix();
                break;
            case "FIELD":
                if (expr.exprs.length == 1) {
                    const field = this.eval(ctx, expr.exprs[0]);
                    if (field < 0 || field > 7) {
                        throw Error(`Invalid field ${field}`, {cause: expr});
                    }
                    ctx.field = field;
                } else {
                    throw Error("Expected one parameter for FIELD", {cause: expr});
                }
                break;
            case "PAGE":
                if (expr.exprs.length == 0) {
                    ctx.clc = (this.getPage(ctx.clc) + 1) * 0o200;
                } else if (expr.exprs.length == 1) {
                    const page = this.eval(ctx, expr.exprs[0]);
                    if (page < 0 || page > 31) {
                        throw Error(`Invalid page ${page}`, {cause: expr});
                    }
                    ctx.clc = page * 0o200;
                } else {
                    throw Error("Expected zero or one parameter for PAGE", {cause: expr});
                }
                break;
            case "EXPUNG":
                this.syms.expunge();
                break;
            case "DEFINE":
                this.handleDefine(ctx, expr);
                break;
            case "ZBLOCK":
                if (expr.exprs.length == 1) {
                    const num = this.eval(ctx, expr.exprs[0]);
                    for (let i = 0; i < num; i++) {
                        if (ctx.generateCode) {
                            this.output(ctx, ctx.field, ctx.clc, 0);
                        }
                        ctx.clc++;
                    }
                } else {
                    throw Error("Expected one parameter for ZBLOCK", {cause: expr});
                }
                break;
            case "IFNZRO":
            case "IFZERO":
            case "IFDEF":
            case "IFNDEF":
                this.handleCondition(ctx, expr);
                break;
            case "NOPUNC":
                ctx.punchEnabled = false;
                break;
            case "ENPUNC":
                ctx.punchEnabled = true;
                break;
            case "DUBL":
            case "FLTG":
                throw Error("Unimplemented", {cause: expr});
        }
    }

    private handleDefine(ctx: Context, expr: SymbolGroup) {
        throw Error("Unimplemented");
    }

    private handleCondition(ctx: Context, expr: SymbolGroup) {
        const op = this.syms.lookup(expr.first.token.symbol).name;

        if (op == "IFDEF" || op == "IFNDEF") {
            if (expr.exprs.length != 2 || expr.exprs[0].type != AstNodeType.Symbol || expr.exprs[1].type != AstNodeType.UnparsedSequence) {
                throw Error("Invalid syntax: single symbol and body expected", {cause: expr});
            }
            const sym = this.syms.tryLookup(expr.exprs[0].token.symbol);
            if ((sym && op == "IFDEF") || (!sym && op == "IFNDEF")) {
                this.handleBody(ctx, expr.exprs[1]);
            }
        } else if (op == "IFZERO" || op == "IFNZRO") {
            if (expr.exprs.length != 2 || expr.exprs[1].type != AstNodeType.UnparsedSequence) {
                throw Error("Invalid syntax: single expression and body expected", {cause: expr});
            }
            const val = this.eval(ctx, expr.exprs[0]);
            if ((val != 0 && op == "IFNZRO") || (val == 0 && op == "IFZERO")) {
                this.handleBody(ctx, expr.exprs[1]);
            }
        }
    }

    private handleBody(ctx: Context, body: UnparsedSequence) {
        if (!body.parsed) {
            const lexer = new Lexer();
            lexer.addInput("body.tmp", body.token.body);

            const parser = new Parser(lexer);
            body.parsed = parser.run();
        }

        if (!ctx.generateCode) {
            this.assignSymbols(ctx, body.parsed);
        } else {
            this.assemble(ctx, body.parsed);
        }
    }

    private eval(ctx: Context, expr: Expression): number {
        switch (expr.type) {
            case AstNodeType.Integer:
                if (ctx.radix == 8 && !expr.token.value.match(/^[0-7]+$/)) {
                    throw Error("Invalid digit in OCTAL", {cause: expr});
                }
                return Number.parseInt(expr.token.value, ctx.radix) & 0o7777;
            case AstNodeType.ASCIIChar:
                return expr.token.char.charCodeAt(0) & 0o7777;
            case AstNodeType.Symbol:
                const sym = this.syms.tryLookup(expr.token.symbol);
                if (sym) {
                    return sym.value;
                } else if (!ctx.generateCode) {
                    console.warn(`Access to undefined symbol ${expr.token.symbol}, setting 0 to fix in pass 2`);
                    return 0;
                } else {
                    throw Error(`Undefined symbol: ${expr.token.symbol}`, {cause: expr});
                }
            case AstNodeType.CLCValue:
                return ctx.clc;
            case AstNodeType.UnaryOp:
                if (expr.operator != "-") {
                    throw Error("Unexpected unary operator", {cause: expr});
                }
                return (-this.eval(ctx, expr.next)) & 0o7777;
            case AstNodeType.ParenExpr:
                const val = this.eval(ctx, expr.expr);
                if (expr.paren == "(") {
                    const curPage = this.getPage(ctx.clc);
                    const link = this.linkTable.enter(ctx.field, curPage, val);
                    return link;
                } else if (expr.paren == "[") {
                    const link = this.linkTable.enter(ctx.field, 0, val);
                    return link;
                } else {
                    throw Error(`Invalid parentheses: "${expr.paren}"`, {cause: expr});
                }
            case AstNodeType.SymbolGroup:
                let groupVal = this.eval(ctx, expr.first);
                for (const ex of expr.exprs) {
                    const exVal = this.eval(ctx, ex);
                    groupVal |= exVal;
                }
                return groupVal;
            case AstNodeType.BinaryOp:
                return this.evalBinOp(ctx, expr);
            case AstNodeType.UnparsedSequence:
                throw Error("Trying to evaluate unparsed list", {cause: expr});
        }
    }

    private evalBinOp(ctx: Context, expr: BinaryOp): number {
        const lhs = this.eval(ctx, expr.lhs);
        const rhs = this.eval(ctx, expr.rhs);

        switch (expr.operator) {
            case "+":   return (lhs + rhs) & 0o7777;
            case "-":   return (lhs - rhs) & 0o7777;
            case "^":   return (lhs * rhs) & 0o7777;
            case "%":   return (lhs / rhs) & 0o7777;
            case "!":   return lhs | rhs;
            case "&":   return lhs & rhs;
        }
    }

    private isPseudoExpr(expr: Expression): expr is SymbolGroup {
        if (expr.type != AstNodeType.SymbolGroup) {
            return false;
        }
        const sym = this.syms.tryLookup(expr.first.token.symbol);
        if (!sym) {
            return false;
        }
        return sym.type == SymbolType.Pseudo;
    }

    private isMRIExpr(expr: Expression): expr is SymbolGroup {
        // An MRI expression needs to start with an MRI op followed by a space -> group
        if (expr.type != AstNodeType.SymbolGroup) {
            return false;
        }

        const sym = this.syms.tryLookup(expr.first.token.symbol);
        if (!sym || sym.type != SymbolType.Fixed) {
            return false;
        }

        // We've got a fixed symbol, now check if it's a MRI
        return ((sym.value & 0o777) == 0) && (sym.value <= 0o5000);
    }

    private genMRI(ctx: Context, expr: SymbolGroup, mri: number, dst: number, ): number {
        const IND   = 0b000100000000;
        const CUR   = 0b000010000000;

        const val = mri | (dst & 0b1111111);

        const curPage = this.getPage(ctx.clc);
        const dstPage = this.getPage(dst);
        if (curPage == dstPage) {
            return val | CUR;
        } else if (dstPage == 0) {
            return val;
        } else if (this.linkTable.has(ctx.field, 0, dst)) {
            if (mri & IND) {
                throw Error("Double indirection on zero page", {cause: expr});
            }
            const indAddr = this.linkTable.enter(ctx.field, 0, dst);
            return mri | (indAddr & 0b1111111) | IND;
        } else {
            if (mri & IND) {
                throw Error("Double indirection on current page", {cause: expr});
            }
            const indAddr = this.linkTable.enter(ctx.field, curPage, dst);
            return mri | (indAddr & 0b1111111) | IND | CUR;
        }
    }

    private getPage(loc: number): number {
        return (loc >> 7) & 31;
    }

    private outputSymbols(ctx: Context) {
        console.log(this.syms.dump());
    }

    private outputLinks(ctx: Context) {
        this.linkTable.visit((field, addr, val) => {
            this.output(ctx, field, addr, val);
        });
    }
}
