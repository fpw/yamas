import * as Nodes from "../parser/Node";
import { Parser } from "../parser/Parser";
import * as CharSets from "../utils/CharSets";
import { toDECFloat } from "../utils/Floats";
import * as PDP8 from "../utils/PDP8";
import { parseIntSafe } from "../utils/Strings";
import { Context } from "./Context";
import { LinkTable } from "./LinkTable";
import { SymbolData, SymbolTable, SymbolType } from "./SymbolTable";

export interface OutputHandler {
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
        "NOPUNCH",  "ENPUNCH",
        "DECIMAL",  "OCTAL",
        "EXPUNGE",  "FIXTAB",
        "PAGE",     "FIELD",    "RELOC",
        "ZBLOCK",
        "IFDEF",    "IFNDEF",   "IFNZRO",   "IFZERO",

        // the following pseudos are handled by the parser, but we still
        // add them here to make the symbols defined
        "DEFINE",
        "TEXT",     "DUBL",     "FLTG",
        "EJECT",    "FIXMRI",
    ];

    public constructor() {
        this.pseudos.forEach(p => this.syms.definePseudo(p));
        this.syms.definePermanent("I", 0o400);
        this.syms.definePermanent("Z", 0);
    }

    public setOutputHandler(out: OutputHandler) {
        this.outputHandler = out;
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

        this.punchOrigin(asmCtx);
        this.programs.forEach(p => this.assembleProgram(asmCtx, p));

        this.outputLinks(asmCtx);
    }

    private createContext(generateCode: boolean): Context {
        return {
            field: 0,
            clc: PDP8.firstAddrInPage(1),
            reloc: 0,
            radix: 8,
            generateCode: generateCode,
            punchEnabled: true,
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
            let generated: boolean;
            switch (stmt.type) {
                case Nodes.NodeType.Text:
                    generated = this.outputText(ctx, stmt.token.str);
                    break;
                case Nodes.NodeType.DoubleIntList:
                    generated = this.outputDubl(ctx, stmt);
                    break;
                case Nodes.NodeType.FloatList:
                    generated = this.outputFltg(ctx, stmt);
                    break;
                case Nodes.NodeType.ExpressionStmt:
                    generated = this.handleExprStmt(ctx, stmt);
                    break;
                default:
                    generated = false;
            }

            if (generated) {
                // we just put something at CLC - check if it overlaps with a link
                this.linkTable.checkOverlap(ctx.field, this.getClc(ctx, false));
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
            case Nodes.NodeType.FixMri:
                const val = this.safeEval(ctx, stmt.assignment.val);
                this.syms.defineFixedParameter(stmt.assignment.sym.token.symbol, val);
                break;
            case Nodes.NodeType.Label:
                this.syms.defineLabel(stmt.sym.token.symbol, this.getClc(ctx, true));
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

    private handleExprStmt(ctx: Context, stmt: Nodes.ExpressionStatement): boolean {
        if (this.isPseudoExpr(stmt.expr)) {
            return false;
        }
        const val = this.safeEval(ctx, stmt.expr);
        this.punchData(ctx, this.getClc(ctx, false), val);
        return true;
    }

    private updateCLC(ctx: Context, stmt: Nodes.Statement) {
        let newClc = this.getClc(ctx, false);

        switch (stmt.type) {
            case Nodes.NodeType.Origin:
                newClc = this.safeEval(ctx, stmt.val);
                this.setClc(ctx, newClc, true);
                this.punchOrigin(ctx);
                return;
            case Nodes.NodeType.Text:
                newClc += CharSets.asciiStringToDec(stmt.token.str, true).length;
                break;
            case Nodes.NodeType.DoubleIntList:
                newClc += stmt.list.filter(x => x.type == Nodes.NodeType.DoubleInt).length * 2;
                break;
            case Nodes.NodeType.FloatList:
                newClc += stmt.list.filter(x => x.type == Nodes.NodeType.Float).length * 3;
                break;
            case Nodes.NodeType.ExpressionStmt:
                if (!this.isPseudoExpr(stmt.expr)) {
                    newClc++;
                }
                break;
        }
        this.setClc(ctx, newClc, false);
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
            case "RELOC":
                this.handleReloc(ctx, group);
                break;
            case "EXPUNG":
                if (!ctx.generateCode) {
                    this.syms.expunge();
                }
                break;
            case "ZBLOCK":
                this.outputZeroBlock(ctx, group);
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
        }
    }

    private handlePage(ctx: Context, group: Nodes.SymbolGroup) {
        let newPage: number;
        if (group.exprs.length == 0) {
            // subtracting 1 because the cursor is already at the next statement
            const curPage = PDP8.calcPageNum(this.getClc(ctx, true) - 1);
            newPage = curPage + 1;
        } else if (group.exprs.length == 1) {
            newPage = this.safeEval(ctx, group.exprs[0]);
            if (newPage < 0 || newPage >= PDP8.NumPages) {
                throw this.mkError(`Invalid page ${newPage}`, group);
            }
        } else {
            throw this.mkError("Expected zero or one parameter for PAGE", group);
        }
        this.setClc(ctx, PDP8.firstAddrInPage(newPage), true);
        this.linkTable.checkOverlap(ctx.field, PDP8.calcPageNum(this.getClc(ctx, true)));
        if (ctx.generateCode) {
            this.punchOrigin(ctx);
        }
    }

    private handleField(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 1) {
            const field = this.safeEval(ctx, group.exprs[0]);
            if (field < 0 || field >= PDP8.NumFields) {
                throw this.mkError(`Invalid field ${field}`, group);
            }

            ctx.field = field;
            if (ctx.reloc) {
                throw this.mkError("Changing FIELD with active reloc not supported", group);
            }
            this.setClc(ctx, PDP8.firstAddrInPage(1), false);
            if (ctx.generateCode) {
                this.punchField(ctx, field);
                this.punchOrigin(ctx);
            }
        } else {
            throw this.mkError("Expected one parameter for FIELD", group);
        }
    }

    private handleReloc(ctx: Context, group: Nodes.SymbolGroup) {
        if (group.exprs.length == 0) {
            ctx.reloc = 0;
        } else if (group.exprs.length == 1) {
            const reloc = this.safeEval(ctx, group.exprs[0]);
            ctx.reloc = reloc - this.getClc(ctx, false);
        } else {
            throw this.mkError("Expected zero or one parameter for RELOC", group);
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
                throw this.mkError("Invalid syntax: single symbol and body expected", group);
            }

            const sym = this.syms.tryLookup(group.exprs[0].token.symbol);
            if ((sym && op == "IFDEF") || (!sym && op == "IFNDEF")) {
                this.handleBody(ctx, group.exprs[1]);
            }
        } else if (op == "IFZERO" || op == "IFNZRO") {
            const last = group.exprs[group.exprs.length - 1];
            if (last.type != Nodes.NodeType.MacroBody) {
                throw this.mkError("Invalid syntax: expression and body expected", group);
            }

            let val = 0;
            for (let i = 0; i < group.exprs.length - 1; i++) {
                val |= this.safeEval(ctx, group.exprs[i]);
            }
            if ((val != 0 && op == "IFNZRO") || (val == 0 && op == "IFZERO")) {
                this.handleBody(ctx, last);
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
            throw this.mkError("Undefined expression", expr);
        }
        return val;
    }

    private tryEval(ctx: Context, expr: Nodes.Expression): number | null {
        switch (expr.type) {
            case Nodes.NodeType.Integer:
                return parseIntSafe(expr.token.value, ctx.radix) & 0o7777;
            case Nodes.NodeType.ASCIIChar:
                return CharSets.asciiCharTo7Bit(expr.token.char, true);
            case Nodes.NodeType.Symbol:
                return this.evalSymbol(ctx, expr);
            case Nodes.NodeType.CLCValue:
                return this.getClc(ctx, true);
            case Nodes.NodeType.UnaryOp:
                return this.evalUnary(ctx, expr);
            case Nodes.NodeType.ParenExpr:
                return this.evalParenExpr(ctx, expr);
            case Nodes.NodeType.SymbolGroup:
                return this.evalSymbolGroup(ctx, expr);
            case Nodes.NodeType.BinaryOp:
                return this.evalBinOp(ctx, expr);
            case Nodes.NodeType.MacroBody:
                throw this.mkError("Trying to evaluate macro body", expr);
        }
    }

    private evalSymbol(ctx: Context, node: Nodes.SymbolNode): number | null {
        const sym = this.syms.tryLookup(node.token.symbol);
        if (!sym) {
            return null;
        }
        if (sym.type == SymbolType.Macro || sym.type == SymbolType.Pseudo) {
            throw this.mkError("Macro and pseudo symbols not allowed here", node);
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

        if (!ctx.generateCode) {
            return null;
        }

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
        if (val === null || !ctx.generateCode) {
            return null;
        }

        if (expr.paren == "(") {
            const linkPage = PDP8.calcPageNum(this.getClc(ctx, false));
            return this.linkTable.enter(ctx, linkPage, val);
        } else if (expr.paren == "[") {
            return this.linkTable.enter(ctx, 0, val);
        } else {
            throw this.mkError(`Invalid parentheses: "${expr.paren}"`, expr);
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

        if (binOp.operator == "%" && rhs == 0) {
            throw this.mkError("Division by zero", binOp);
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

        // We've got a fixed symbol, now check if it's a MRI opcode
        return PDP8.isMRIOp(sym.value);
    }

    private genMRI(ctx: Context, group: Nodes.SymbolGroup, mri: number, dst: number): number {
        const IND   = 0b000100000000;
        const CUR   = 0b000010000000;

        const effVal = mri | (dst & 0b1111111);

        const curPage = PDP8.calcPageNum(this.getClc(ctx, true));
        const dstPage = PDP8.calcPageNum(dst);
        if (dstPage == 0) {
            return effVal;
        } else if (curPage == dstPage) {
            return effVal | CUR;
        } else {
            if (mri & IND) {
                throw this.mkError(`Double indirection on page ${curPage}"`, group);
            }
            const linkPage = PDP8.calcPageNum(this.getClc(ctx, false));
            const indAddr = this.linkTable.enter(ctx, linkPage, dst);
            return mri | (indAddr & 0b1111111) | IND | CUR;
        }
    }

    private outputText(ctx: Context, text: string): boolean {
        const outStr = CharSets.asciiStringToDec(text, true);
        const addr = this.getClc(ctx, false);
        outStr.forEach((w, i) => this.punchData(ctx, addr + i, w));
        return true;
    }

    private outputZeroBlock(ctx: Context, group: Nodes.SymbolGroup) {
        let newClc = this.getClc(ctx, false);
        if (group.exprs.length == 1) {
            const num = this.safeEval(ctx, group.exprs[0]);
            for (let i = 0; i < num; i++) {
                if (ctx.generateCode) {
                    this.punchData(ctx, newClc, 0);
                }
                newClc++;
            }
        } else {
            throw this.mkError("Expected one parameter for ZBLOCK", group);
        }
        this.setClc(ctx, newClc, false);
    }

    private outputDubl(ctx: Context, stmt: Nodes.DoubleIntList): boolean {
        if (stmt.list.length == 0) {
            return false;
        }

        let loc = this.getClc(ctx, false);
        for (const dubl of stmt.list) {
            if (dubl.type != Nodes.NodeType.DoubleInt) {
                continue;
            }
            let num = parseIntSafe(dubl.token.value, 10);
            if (dubl.unaryOp?.char === "-") {
                num = -num;
            }
            this.punchData(ctx, loc++, (num >> 12) & 0o7777);
            this.punchData(ctx, loc++, num & 0o7777);
        }
        return true;
    }

    private outputFltg(ctx: Context, stmt: Nodes.FloatList): boolean {
        if (stmt.list.length == 0) {
            return false;
        }

        let loc = this.getClc(ctx, false);
        for (const fltg of stmt.list) {
            if (fltg.type != Nodes.NodeType.Float) {
                continue;
            }

            const [e, m1, m2] = toDECFloat(fltg.token.float);
            this.punchData(ctx, loc++, e);
            this.punchData(ctx, loc++, m1);
            this.punchData(ctx, loc++, m2);
        }
        return true;
    }

    private outputLinks(ctx: Context) {
        let curField = ctx.field;
        let curAddr = ctx.clc;
        this.linkTable.visit((field, addr, val) => {
            if (field != curField) {
                this.punchField(ctx, field);
                curField = field;
                curAddr = 0o200;
            }
            if (curAddr != addr) {
                curAddr = addr;
                this.punchOrigin(ctx, curAddr);
            }
            this.punchData(ctx, curAddr, val);
            curAddr++;
        });
    }

    private getClc(ctx: Context, reloc: boolean) {
        return (ctx.clc + (reloc ? ctx.reloc : 0)) & 0o7777;
    }

    private setClc(ctx: Context, clc: number, reloc: boolean) {
        ctx.clc = (clc - (reloc ? ctx.reloc : 0)) & 0o7777;
    }

    private punchData(ctx: Context, addr: number, val: number) {
        if (ctx.punchEnabled && this.outputHandler) {
            this.outputHandler.writeValue(addr, val);
        }
    }

    private punchOrigin(ctx: Context, origin?: number) {
        if (ctx.punchEnabled && this.outputHandler) {
            const to = origin ?? this.getClc(ctx, false);
            this.outputHandler.changeOrigin(to);
        }
    }

    private punchField(ctx: Context, field: number) {
        if (ctx.punchEnabled && this.outputHandler) {
            this.outputHandler.changeField(field);
        }
    }

    private mkError(msg: string, node: Nodes.Node) {
        return Parser.mkNodeError(msg, node);
    }
}
