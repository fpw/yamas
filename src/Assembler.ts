import { Context } from "./Context";
import { LinkTable } from "./LinkTable";
import { SymbolTable, SymbolType } from "./SymbolTable";
import { Lexer } from "./lexer/Lexer";
import { BinaryOp, Expression, ExpressionStatement, Program, Statement, SymbolGroup, UnparsedSequence } from "./parser/AST";
import { Parser } from "./parser/Parser";
import { PreludeEAE } from "./prelude/EAE";
import { PreludeFamily8 } from "./prelude/Family8";
import { PreludeIO } from "./prelude/IO";

export class Assembler {
    private lexer = new Lexer();
    private syms = new SymbolTable();
    private linkTable = new LinkTable();

    private readonly pseudos = [
        "PAGE",     "FIELD",
        "DECIMAL",  "OCTAL",
        "DUBL",     "FLTG",
        "EXPUNGE",  "FIXTAB",
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
        let ast;

        try {
            ast = parser.run();
        } catch (e) {
            console.error(this.lexer.getCursorString());
            throw e;
        }

        const symCtx = this.createContext(false);
        this.assignSymbols(symCtx, ast);
        // this.outputSymbols();

        const asmCtx = this.createContext(true);
        this.assemble(asmCtx, ast);

        // this.outputLinks();
    }

    private createContext(generateCode: boolean): Context {
        return {
            field: 0,
            clc: 0o200,
            radix: 8,
            generateCode: generateCode,
        };
    }

    private assignSymbols(ctx: Context, prog: Program) {
        for (const stmt of prog.stmts) {
            switch (stmt.type) {
                case "param":
                    const paramVal = this.eval(ctx, stmt.val);
                    this.syms.defineParameter(stmt.sym.sym, paramVal);
                    break;
                case "label":
                    this.syms.defineLabel(stmt.sym.sym, ctx.clc);
                    break;
                case "exprStmt":
                    // need to handle pseudos because they can change the radix or CLC,
                    // affecting expression parsing for symbol definitions
                    if (this.isPseudoExpr(stmt.expr)) {
                        this.handlePseudo(ctx, stmt.expr);
                    }
                    break;
            }
            this.updateCLC(ctx, stmt);
        }
    }

    private assemble(ctx: Context, prog: Program) {
        for (const stmt of prog.stmts) {
            switch (stmt.type) {
                case "text":
                    let loc = ctx.clc;
                    for (let i = 0; i < stmt.text.length - 1; i += 2) {
                        const left = this.to6Bit(stmt.text[i]);
                        const right = this.to6Bit(stmt.text[i + 1]);
                        this.output(ctx.field, loc, (left << 6) | right);
                        loc++;
                    }
                    if (stmt.text.length % 2 == 0) {
                        this.output(ctx.field, loc, 0);
                    } else {
                        const left = this.to6Bit(stmt.text[stmt.text.length - 1]);
                        this.output(ctx.field, loc, left << 6);
                    }
                    break;
                case "exprStmt":
                    this.handleExprStmt(ctx, stmt);
                    break;
            }

            this.updateCLC(ctx, stmt);
        }
    }

    private to6Bit(str: string): number {
        const val = str.charCodeAt(0);
        return val & 0o77;
    }

    private handleExprStmt(ctx: Context, stmt: ExpressionStatement) {
        if (this.isPseudoExpr(stmt.expr)) {
            this.handlePseudo(ctx, stmt.expr);
        } else if (this.isMRIExpr(stmt.expr)) {
            this.handleLoadMRI(ctx, stmt.expr);
        } else {
            const val = this.eval(ctx, stmt.expr);
            this.output(ctx.field, ctx.clc, val);
        }
    }

    private handleLoadMRI(ctx: Context, expr: SymbolGroup) {
        const mri = this.syms.lookup(expr.first.sym);
        let mriVal = mri.value;
        let dst = 0;

        for (const ex of expr.exprs) {
            if (ex.type == "symbol") {
                const sym = this.syms.lookup(ex.sym);
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
        this.output(ctx.field, ctx.clc, effVal);
    }

    private output(field: number, clc: number, value: number) {
        // console.log(`${field}${clc.toString(8).padStart(4, "0")} ${value.toString(8).padStart(4, "0")}`);
    }

    private updateCLC(ctx: Context, stmt: Statement) {
        switch (stmt.type) {
            case "origin":
                ctx.clc = this.eval(ctx, stmt.val);;
                break;
            case "text":
                ctx.clc += Math.ceil(stmt.text.length / 2);
                if (stmt.text.length % 2 == 0) {
                    // null terminator. For odd-length strings, part of last symbol.
                    ctx.clc++;
                }
                break;
            case "exprStmt":
                if (!this.isPseudoExpr(stmt.expr)) {
                    ctx.clc++;
                }
                break;
        }
    }

    private handlePseudo(ctx: Context, expr: SymbolGroup) {
        const name = this.syms.lookup(expr.first.sym).name;

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
                            this.output(ctx.field, ctx.clc, 0);
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
            case "DUBL":
            case "FLTG":
                throw Error("Unimplemented");
        }
    }

    private handleDefine(ctx: Context, expr: SymbolGroup) {
        throw Error("Unimplemented");
    }

    private handleCondition(ctx: Context, expr: SymbolGroup) {
        const op = this.syms.lookup(expr.first.sym).name;

        if (op == "IFDEF" || op == "IFNDEF") {
            if (expr.exprs.length != 2 || expr.exprs[0].type != "symbol" || expr.exprs[1].type != "unparsed") {
                throw Error("Invalid syntax: single symbol and body expected", {cause: expr});
            }
            const sym = this.syms.tryLookup(expr.exprs[0].sym);
            if ((sym && op == "IFDEF") || (!sym && op == "IFNDEF")) {
                this.handleBody(ctx, expr.exprs[1]);
            }
        } else if (op == "IFZERO" || op == "IFNZRO") {
            if (expr.exprs.length != 2 || expr.exprs[1].type != "unparsed") {
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
            lexer.addInput("condition", body.body);

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
            case "integer":
                if (ctx.radix == 8 && !expr.int.match(/^[0-7]+$/)) {
                    throw Error("Invalid digit in OCTAL", {cause: expr});
                }
                return Number.parseInt(expr.int, ctx.radix) & 0o7777;
            case "ascii":
                return expr.char.charCodeAt(0) & 0o7777;
            case "symbol":
                const sym = this.syms.tryLookup(expr.sym);
                if (sym) {
                    return sym.value;
                } else if (!ctx.generateCode) {
                    console.warn(`Access to undefined symbol ${expr.sym}`);
                    return 0;
                } else {
                    throw Error(`Undefined symbol: ${expr.sym}`, {cause: expr});
                }
            case "clc":
                return ctx.clc;
            case "unary":
                if (expr.operator != "-") {
                    throw Error("Unexpected unary operator", {cause: expr});
                }
                return (-this.eval(ctx, expr.next)) & 0o7777;
            case "paren":
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
            case "group":
                let groupVal = this.eval(ctx, expr.first);
                for (const ex of expr.exprs) {
                    const exVal = this.eval(ctx, ex);
                    groupVal |= exVal;
                }
                return groupVal;
            case "binop":
                return this.evalBinOp(ctx, expr);
            case "unparsed":
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
        if (expr.type != "group") {
            return false;
        }
        const sym = this.syms.tryLookup(expr.first.sym);
        if (!sym) {
            return false;
        }
        return sym.type == SymbolType.Pseudo;
    }

    private isMRIExpr(expr: Expression): expr is SymbolGroup {
        // An MRI expression needs to start with an MRI op followed by a space -> group
        if (expr.type != "group") {
            return false;
        }

        const sym = this.syms.tryLookup(expr.first.sym);
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

    private outputSymbols() {
        console.log(this.syms.dump());
    }

    private outputLinks() {
        this.linkTable.visit((field, addr, val) => {
            this.output(field, addr, val);
        });
    }
}
