import { asciiCharTo6Bit, calcFieldNum, calcFirstPageLoc, calcPageNum } from "../common";
import { SymbolToken } from "../lexer/Token";
import * as Nodes from "../parser/Node";
import { Parser } from "../parser/Parser";
import { PreludeEAE } from "../prelude/EAE";
import { PreludeFamily8 } from "../prelude/Family8";
import { PreludeIO } from "../prelude/IO";
import { Context } from "./Context";
import { LinkTable } from "./LinkTable";
import { SymbolTable, SymbolType } from "./SymbolTable";

export class Assembler {
    private syms = new SymbolTable();
    private linkTable = new LinkTable();
    private programs: Nodes.Program[] = [];

    private readonly pseudos = [
        // TEXT: handled by lexer
        // DEFINE: handled by parser

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

    public addFile(name: string, content: string) {
        this.parseInput(name, content);
    }

    private loadPrelude() {
        this.parseInput("prelude/family8.pa", PreludeFamily8);
        this.parseInput("prelude/iot.pa", PreludeIO);
        this.parseInput("prelude/eae.pa", PreludeEAE);
    }

    private parseInput(name: string, input: string) {
        const parser = new Parser(name, input);
        const prog = parser.parseProgram();
        this.programs.push(prog);
    }

    public run() {
        const symCtx = this.createContext(false);
        this.programs.forEach(p => this.assignSymbols(symCtx, p));

        const asmCtx = this.createContext(true);
        this.programs.forEach(p => this.assemble(asmCtx, p));

        if (false) {
            this.outputSymbols(asmCtx);
            this.outputLinks(asmCtx);
        }
    }

    private createContext(generateCode: boolean): Context {
        return {
            clc: 0o200,
            radix: 8,
            punchEnabled: true,
            generateCode: generateCode,
        };
    }

    private assignSymbols(ctx: Context, prog: Nodes.Program) {
        for (const stmt of prog.stmts) {
            this.updateSymbols(ctx, stmt);
            this.updateCLC(ctx, stmt);
        }
    }

    private assemble(ctx: Context, prog: Nodes.Program) {
        for (const stmt of prog.stmts) {
            switch (stmt.type) {
                case Nodes.NodeType.Text:
                    this.outputText(ctx, stmt.token.text);
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
                    this.handlePseudo(ctx, stmt.expr);
                }
                break;
        }
    }

    private handleExprStmt(ctx: Context, stmt: Nodes.ExpressionStatement) {
        if (this.isPseudoExpr(stmt.expr)) {
            // this is handled by updateSymbols which is called in both symbol and assembly phases
        } else if (this.isMRIExpr(stmt.expr)) {
            this.handleLoadMRI(ctx, stmt.expr);
        } else {
            const val = this.eval(ctx, stmt.expr);
            this.output(ctx, ctx.clc, val);
        }
    }

    private handleLoadMRI(ctx: Context, group: Nodes.SymbolGroup) {
        const mri = this.syms.lookup(group.first.token.symbol);
        let mriVal = mri.value;
        let dst = 0;

        for (const ex of group.exprs) {
            if (ex.type == Nodes.NodeType.Symbol) {
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

        const effVal = this.genMRI(ctx, group, mriVal, dst);
        this.output(ctx, ctx.clc, effVal);
    }

    private updateCLC(ctx: Context, stmt: Nodes.Statement) {
        switch (stmt.type) {
            case Nodes.NodeType.Origin:
                ctx.clc = this.eval(ctx, stmt.val);;
                break;
            case Nodes.NodeType.Text:
                ctx.clc += Math.ceil(stmt.token.text.length / 2);
                if (stmt.token.text.length % 2 == 0) {
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
                ctx.punchEnabled = false;
                break;
            case "ENPUNC":
                ctx.punchEnabled = true;
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
                    this.output(ctx, ctx.clc, 0);
                }
                ctx.clc++;
            }
        } else {
            throw Error("Expected one parameter for ZBLOCK", { cause: group });
        }
    }

    private handlePage(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 0) {
            ctx.clc = calcFirstPageLoc(calcFieldNum(ctx.clc), calcPageNum(ctx.clc) + 1);
        } else if (group.exprs.length == 1) {
            const page = this.eval(ctx, group.exprs[0]);
            if (page < 0 || page > 31) {
                throw Error(`Invalid page ${page}`, { cause: group });
            }
            ctx.clc = calcFirstPageLoc(calcFieldNum(ctx.clc), page);
        } else {
            throw Error("Expected zero or one parameter for PAGE", { cause: group });
        }
    }

    private handleField(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 1) {
            const field = this.eval(ctx, group.exprs[0]);
            if (field < 0 || field > 7) {
                throw Error(`Invalid field ${field}`, { cause: group });
            }
            ctx.clc = calcFirstPageLoc(field, 1);
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
            this.assemble(ctx, program);
        }
    }

    private eval(ctx: Context, expr: Nodes.Expression): number {
        switch (expr.type) {
            case Nodes.NodeType.Integer:
                if (ctx.radix == 8 && !expr.token.value.match(/^[0-7]+$/)) {
                    throw Error("Invalid digit in OCTAL", {cause: expr});
                }
                return Number.parseInt(expr.token.value, ctx.radix) & 0o7777;
            case Nodes.NodeType.ASCIIChar:
                return expr.token.char.charCodeAt(0) & 0o7777;
            case Nodes.NodeType.Symbol:
                return this.evalSymbol(ctx, expr.token);
            case Nodes.NodeType.CLCValue:
                return ctx.clc;
            case Nodes.NodeType.UnaryOp:
                if (expr.operator != "-") {
                    throw Error("Unexpected unary operator", {cause: expr});
                }
                return (-this.eval(ctx, expr.elem)) & 0o7777;
            case Nodes.NodeType.ParenExpr:
                return this.evalParenExpr(ctx, expr);
            case Nodes.NodeType.SymbolGroup:
                const init = this.eval(ctx, expr.first);
                return expr.exprs.reduce((acc, cur) => acc | this.eval(ctx, cur), init);
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
            console.warn(`Access to undefined symbol ${symTok.symbol}, setting 0 to fix in pass 2`);
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

    private isPseudoExpr(expr: Nodes.Expression): expr is Nodes.SymbolGroup {
        if (expr.type != Nodes.NodeType.SymbolGroup) {
            return false;
        }
        const sym = this.syms.tryLookup(expr.first.token.symbol);
        if (!sym) {
            return false;
        }
        return sym.type == SymbolType.Pseudo;
    }

    private isMRIExpr(expr: Nodes.Expression): expr is Nodes.SymbolGroup {
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

    private genMRI(ctx: Context, group: Nodes.SymbolGroup, mri: number, dst: number, ): number {
        const IND   = 0b000100000000;
        const CUR   = 0b000010000000;

        const val = mri | (dst & 0b1111111);

        const curPage = calcPageNum(ctx.clc);
        const dstPage = calcPageNum(dst);
        if (curPage == dstPage) {
            return val | CUR;
        } else if (dstPage == 0) {
            return val;
        } else if (this.linkTable.has(calcFieldNum(ctx.clc), 0, dst)) {
            if (mri & IND) {
                throw Error("Double indirection on zero page", {cause: group});
            }
            const indAddr = this.linkTable.enter(calcFieldNum(ctx.clc), 0, dst);
            return mri | (indAddr & 0b1111111) | IND;
        } else {
            if (mri & IND) {
                throw Error("Double indirection on current page", {cause: group});
            }
            const indAddr = this.linkTable.enter(calcFieldNum(ctx.clc), curPage, dst);
            return mri | (indAddr & 0b1111111) | IND | CUR;
        }
    }

    private outputSymbols(ctx: Context) {
        console.log(this.syms.dump());
    }

    private outputLinks(ctx: Context) {
        this.linkTable.visit((field, addr, val) => {
            this.output(ctx, calcFirstPageLoc(field, 0) | addr, val);
        });
    }

    private output(ctx: Context, clc: number, value: number) {
        if (ctx.punchEnabled) {
            // console.log(`${clc.toString(8).padStart(5, "0")} ${value.toString(8).padStart(4, "0")}`);
        }
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
            this.output(ctx, loc, (left << 6) | right);
            loc++;
        }
        if (text.length % 2 == 0) {
            this.output(ctx, loc, 0);
        } else {
            const left = asciiCharTo6Bit(text[text.length - 1]);
            this.output(ctx, loc, left << 6);
        }
    }
}
