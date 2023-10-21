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
        "TEXT",
        "PAUSE",
        "IFDEF", "IFNDEF", "IFNZRO", "IFZERO",
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
        const prelude = parser.parseProgram();
        this.assignSymbols(prelude);
    }

    public addFile(name: string, content: string) {
        this.lexer.addInput(name, content);
    }

    public run() {
        const parser = new Parser(this.lexer);
        const ast = parser.parseProgram();

        this.assignSymbols(ast);
        console.log(this.syms.dump());

        this.assemble(ast);
        this.outputLinks();
    }

    private createContext(): Context {
        return {
            field: 0,
            clc: 0o200,
            radix: 8,
        };
    }

    private assignSymbols(prog: Program) {
        const ctx = this.createContext();

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

    private assemble(prog: Program) {
        const ctx = this.createContext();

        for (const stmt of prog.stmts) {
            switch (stmt.type) {
                case "text":
                    // TODO
                    break;
                case "exprStmt":
                    this.handleExprStmt(ctx, stmt);
                    break;
            }

            this.updateCLC(ctx, stmt);
        }
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

        const effVal = this.genMRI(ctx, mriVal, dst);
        this.output(ctx.field, ctx.clc, effVal);
    }

    private output(field: number, clc: number, value: number) {
        console.log(`${field}${clc.toString(8)} ${value.toString(8)}`);
    }

    private updateCLC(ctx: Context, stmt: Statement) {
        switch (stmt.type) {
            case "origin":
                ctx.clc = this.eval(ctx, stmt.val);;
                break;
            case "text":
                // TODO
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
                        throw Error(`Invalid field ${field}`);
                    }
                    ctx.field = field;
                } else {
                    throw Error("Expected one parameter for FIELD");
                }
                break;
            case "PAGE":
                if (expr.exprs.length == 0) {
                    ctx.clc = (this.getPage(ctx.clc) + 1) * 0o200;
                } else if (expr.exprs.length == 1) {
                    const page = this.eval(ctx, expr.exprs[0]);
                    if (page < 0 || page > 31) {
                        throw Error(`Invalid page ${page}`);
                    }
                    ctx.clc = page * 0o200;
                } else {
                    throw Error("Expected zero or one parameter for PAGE");
                }
                break;
            case "EXPUNG":
                this.syms.expunge();
                break;
            case "DEFINE":
                this.handleDefine(ctx, expr);
                break;
            case "IFNZRO":
            case "IFZERO":
            case "IFDEF":
            case "IFNDEF":
                this.handleCondition(ctx, expr);
                break;
        }
    }

    private handleDefine(ctx: Context, expr: SymbolGroup) {
    }

    private handleCondition(ctx: Context, expr: SymbolGroup) {
        const sym = this.syms.lookup(expr.first.sym);


        let cond: boolean;
        let seq: UnparsedSequence;
    }

    private eval(ctx: Context, expr: Expression): number {
        switch (expr.type) {
            case "integer":
                if (ctx.radix == 8 && !expr.int.match(/^[0-7]+$/)) {
                    throw Error("Invalid digit in OCTAL");
                }
                return Number.parseInt(expr.int, ctx.radix) & 0o7777;
            case "ascii":
                return expr.char.charCodeAt(0) & 0o7777;
            case "symbol":
                return this.syms.lookup(expr.sym).value;
            case "clc":
                return ctx.clc;
            case "unary":
                if (expr.operator != "-") {
                    throw Error("Unexpected unary operator");
                }
                return -this.eval(ctx, expr.next);
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
                    throw Error(`Invalid parentheses: "${expr.paren}"`);
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
                throw Error("Trying to evaluate unparsed list");
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
        const sym = this.syms.lookup(expr.first.sym);
        return sym.type == SymbolType.Pseudo;
    }

    private isMRIExpr(expr: Expression): expr is SymbolGroup {
        // An MRI expression needs to start with an MRI op followed by a space -> group
        if (expr.type != "group") {
            return false;
        }

        const sym = this.syms.lookup(expr.first.sym);
        if (sym.type != SymbolType.Fixed) {
            return false;
        }

        // We've got a fixed symbol, now check if it's a MRI
        return ((sym.value & 0o777) == 0) && (sym.value <= 0o5000);
    }

    private genMRI(ctx: Context, mri: number, dst: number, ): number {
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
                throw Error("Double indirection on zero page");
            }
            const indAddr = this.linkTable.enter(ctx.field, 0, dst);
            return mri | (indAddr & 0b1111111) | IND;
        } else {
            if (mri & IND) {
                throw Error("Double indirection on current page");
            }
            const indAddr = this.linkTable.enter(ctx.field, curPage, dst);
            return mri | (indAddr & 0b1111111) | IND | CUR;
        }
    }

    private getPage(loc: number): number {
        return (loc >> 7) & 31;
    }

    private outputLinks() {
        this.linkTable.visit((field, addr, val) => {
            this.output(field, addr, val);
        });
    }
}
