import { Context } from "./Context";
import { LinkTable } from "./LinkTable";
import { DefinedSymbol, SymbolTable, SymbolType } from "./SymbolTable";
import { Lexer } from "./lexer/Lexer";
import { BinaryOp, Expression, ExpressionStatement, Program, Statement } from "./parser/AST";
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
        this.syms.definePermanent("I", 0);
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
                    if (paramVal === undefined) {
                        throw Error(`Right-hand side undefined when assigning parameter ${stmt.sym.sym}`);
                    }
                    this.syms.defineParameter(stmt.sym.sym, paramVal);
                    break;
                case "label":
                    this.syms.defineLabel(stmt.sym.sym, ctx.clc);
                    break;
                case "exprStmt":
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
            if (val === undefined) {
                throw Error("Failed to evaluate expression: undefined value");
            }

            this.output(ctx.field, ctx.clc, val);
        }
    }

    private handleLoadMRI(ctx: Context, expr: BinaryOp) {
        const mri = this.getFirstExprSymbol(expr);
        if (!mri || mri.value === undefined) {
            throw Error("MRI with undefined MRI op");
        }

        const val = this.eval(ctx, expr.rhs);
        if (val === undefined) {
            throw Error("Undefined MRI operands");
        }
        const ind = this.getPageMode(expr.rhs);
        const effVal = this.genMRI(ctx, val, ind) | mri.value;
        this.output(ctx.field, ctx.clc, effVal);
    }

    private output(field: number, clc: number, value: number) {
        console.log(`${field}${clc.toString(8)} ${value.toString(8)}`);
    }

    private updateCLC(ctx: Context, stmt: Statement) {
        switch (stmt.type) {
            case "origin":
                const org = this.eval(ctx, stmt.val);
                if (org === undefined) {
                    throw Error("Right-hand side undefined when assigning origin");
                }
                ctx.clc = org;
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

    private handlePseudo(ctx: Context, expr: Expression) {
        const sym = this.getFirstExprSymbol(expr);
        if (!sym) {
            throw Error("Logic error: Pseudo not starting with pseudo");
        }

        switch (this.syms.lookup(sym.name)?.name) {
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
                if (expr.type == "binop" && expr.operator == " ") {
                    const field = this.eval(ctx, expr.rhs);
                    if (field === undefined || field < 0 || field > 7) {
                        throw Error(`Invalid field ${field}`);
                    }
                    ctx.field = field;
                } else {
                    throw Error("Field without parameters");
                }
                break;
            case "PAGE":
                if (expr.type == "binop" && expr.operator == " ") {
                    const page = this.eval(ctx, expr.rhs);
                    if (page === undefined || page < 0 || page > 31) {
                        throw Error(`Invalid page ${page}`);
                    }
                    ctx.clc = page * 0o200;
                } else {
                    ctx.clc = (this.getPage(ctx.clc) + 1) * 0o200;
                }
                break;
            case "EXPUNG":
                this.syms.expunge();
                break;
            case "DEFINE":
                if (expr.type != "binop" || expr.operator != " ") {
                    throw Error("Invalid DEFINE syntax");
                }
                this.handleDefine(ctx, expr);
                break;
        }
    }

    private handleDefine(ctx: Context, expr: BinaryOp) {
    }

    private eval(ctx: Context, expr: Expression): number | undefined {
        switch (expr.type) {
            case "integer":
                if (ctx.radix == 8 && !expr.int.match(/^[0-7]+$/)) {
                    throw Error("Invalid digit");
                }
                return Number.parseInt(expr.int, ctx.radix) & 0o7777;
            case "ascii":
                return expr.char.charCodeAt(0) & 0o7777;
            case "symbol":
                return this.syms.lookup(expr.sym)?.value;
            case "clc":
                return ctx.clc;
            case "unary":
                if (expr.operator == "-") {
                    const val = this.eval(ctx, expr.next);
                    if (val === undefined) {
                        throw Error("Undefined unary operand");
                    }
                    return -val;
                }
                break;
            case "paren":
                const val = this.eval(ctx, expr.expr);
                if (val === undefined) {
                    throw Error("Undefined literal value");
                }
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
            case "binop":
                return this.evalBinOp(ctx, expr);
        }
    }

    private evalBinOp(ctx: Context, expr: BinaryOp): number | undefined {
        const lhs = this.eval(ctx, expr.lhs);
        const rhs = this.eval(ctx, expr.rhs);

        if (lhs === undefined || rhs === undefined) {
            return undefined;
        }

        switch (expr.operator) {
            case "+":   return (lhs + rhs) & 0o7777;
            case "-":   return (lhs - rhs) & 0o7777;
            case "^":   return (lhs * rhs) & 0o7777;
            case "%":   return (lhs / rhs) & 0o7777;
            case "!":   return lhs | rhs;
            case "&":   return lhs & rhs;
            case " ":   return lhs | rhs;
        }
    }

    private getPageMode(expr: Expression): "I" | "Z" | undefined {
        if (expr.type == "symbol" && (expr.sym == "I" || expr.sym == "Z")) {
            return expr.sym;
        } else if (expr.type == "binop") {
            const lhs = this.getPageMode(expr.lhs);
            const rhs = this.getPageMode(expr.lhs);
            if (lhs == "I" && rhs == "Z") {
                throw Error("Can't generate both I and Z indirection");
            }
            return lhs ?? rhs;
        } else {
            return undefined;
        }
    }

    private isPseudoExpr(expr: Expression): boolean {
        const sym = this.getFirstExprSymbol(expr);
        if (!sym || sym.type != SymbolType.Pseudo) {
            return false;
        }

        return true;
    }

    private isMRIExpr(expr: Expression): expr is BinaryOp {
        // An MRI expression needs to start with an MRI op followed by a space
        // and at least one more operand -> binop with space

        if (expr.type != "binop" || expr.operator != " ") {
            return false;
        }

        const sym = this.getFirstExprSymbol(expr);
        if (!sym || sym.type != SymbolType.Fixed || sym.value === undefined) {
            return false;
        }

        // We've got a fixed symbol, now check if it's a MRI
        return ((sym.value & 0o777) == 0) && (sym.value <= 0o5000);
    }

    private getFirstExprSymbol(expr: Expression): DefinedSymbol | undefined {
        let sym: string | undefined;
        switch (expr.type) {
            case "binop":
                if (expr.lhs.type == "symbol") {
                    sym = expr.lhs.sym;
                }
                break;
            case "symbol":
                sym = expr.sym;
                break;
        }

        if (!sym) {
            return undefined;
        }

        if (sym) {
            return this.syms.lookup(sym);
        }
    }

    private genMRI(ctx: Context, dst: number, mode: "I" | "Z" | undefined): number {
        const IND   = 0b000100000000;
        const CUR   = 0b000010000000;

        let val = dst & 0b1111111;
        if (mode == "I") {
            val |= IND;
        }

        const curPage = this.getPage(ctx.clc);
        const dstPage = this.getPage(dst);
        if (curPage == dstPage) {
            if (mode == "Z" && curPage != 0) {
                throw Error("Invalid Z indirection");
            }
            return val | CUR;
        } else if (dstPage == 0) {
            return val;
        } else if (this.linkTable.has(ctx.field, 0, dst)) {
            if (mode == "I") {
                throw Error("Double indirection on zero page");
            }
            const indAddr = this.linkTable.enter(ctx.field, 0, dst);
            return (indAddr & 0b1111111) | IND;
        } else {
            if (mode == "I") {
                throw Error("Double indirection on current page");
            }
            const indAddr = this.linkTable.enter(ctx.field, curPage, dst);
            return (indAddr & 0b1111111) | IND | CUR;
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
