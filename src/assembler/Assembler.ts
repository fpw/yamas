import * as Nodes from "../parser/Node";
import { NodeType } from "../parser/Node";
import { Parser } from "../parser/Parser";
import * as CharSets from "../utils/CharSets";
import { CodeError } from "../utils/CodeError";
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

    public constructor() {
        Parser.SupportedKeywords.forEach(k => this.syms.definePseudo(k));
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

    public assembleAll(): CodeError[] {
        const errors: CodeError[] = this.programs.map(p => p.errors).flat();

        const symCtx = this.createContext(false);
        for (const prog of this.programs) {
            const symErrors = this.assignSymbols(symCtx, prog);
            errors.push(...symErrors);
        }

        const asmCtx = this.createContext(true);
        this.punchOrigin(asmCtx);
        for (const prog of this.programs) {
            const asmErrors = this.assembleProgram(asmCtx, prog);
            errors.push(...asmErrors);
        }

        this.outputLinks(asmCtx);

        return errors;
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

    private assignSymbols(ctx: Context, prog: Nodes.Program): CodeError[] {
        const errors: CodeError[] = [];
        for (const stmt of prog.stmts) {
            try {
                this.updateSymbols(ctx, stmt);
                this.updateCLC(ctx, stmt);
            } catch (e) {
                if (e instanceof CodeError) {
                    errors.push(e);
                } else if (e instanceof Error) {
                    errors.push(new CodeError(e.message, prog.inputName, 0, 0));
                }
            }
        }
        return errors;
    }

    private assembleProgram(ctx: Context, prog: Nodes.Program): CodeError[] {
        const errors: CodeError[] = [];
        for (const stmt of prog.stmts) {
            try {
                this.assembleStatement(ctx, stmt);
            } catch (e) {
                if (e instanceof CodeError) {
                    errors.push(e);
                } else if (e instanceof Error) {
                    errors.push(new CodeError(e.message, prog.inputName, 0, 0));
                }
            }
        }
        return errors;
    }

    private assembleStatement(ctx: Context, stmt: Nodes.Statement) {
        let generated = false;
        switch (stmt.type) {
            case NodeType.ZeroBlock:        generated = this.outputZBlock(ctx, stmt); break;
            case NodeType.Text:             generated = this.outputText(ctx, stmt.str.str); break;
            case NodeType.DoubleIntList:    generated = this.outputDubl(ctx, stmt); break;
            case NodeType.FloatList:        generated = this.outputFltg(ctx, stmt); break;
            case NodeType.DeviceName:       generated = this.outputDeviceName(ctx, stmt.name.token.symbol); break;
            case NodeType.FileName:         generated = this.outputFileName(ctx, stmt.name.str); break;
            case NodeType.ExpressionStmt:   generated = this.handleExprStmt(ctx, stmt); break;
        }

        if (generated) {
            // we just put something at CLC - check if it overlaps with a link
            this.linkTable.checkOverlap(this.getClc(ctx, false));
        }

        // symbols need to be updated here as well because it's possible to use
        // undefined symbols on the right hand side of A=B in pass 1
        this.updateSymbols(ctx, stmt);
        this.updateCLC(ctx, stmt);
    }

    // eslint-disable-next-line max-lines-per-function
    private updateSymbols(ctx: Context, stmt: Nodes.Statement) {
        switch (stmt.type) {
            case NodeType.Assignment:
                const paramVal = this.tryEval(ctx, stmt.val);
                // undefined expressions lead to undefined symbols
                if (paramVal !== null) {
                    this.syms.defineParameter(stmt.sym.token.symbol, paramVal);
                }
                break;
            case NodeType.FixMri:
                const val = this.safeEval(ctx, stmt.assignment.val);
                this.syms.defineForcedMri(stmt.assignment.sym.token.symbol, val);
                break;
            case NodeType.Label:
                this.syms.defineLabel(stmt.sym.token.symbol, this.getClc(ctx, true));
                break;
            case NodeType.Define:
                if (!ctx.generateCode) {
                    // define macros only once so we don't get duplicates in next pass
                    this.syms.defineMacro(stmt.name.token.symbol);
                }
                break;
            case NodeType.IfDef:
            case NodeType.IfNotDef:
                this.handleIfDef(ctx, stmt);
                break;
            case NodeType.IfZero:
            case NodeType.IfNotZero:
                this.handleIfZero(ctx, stmt);
                break;
            case NodeType.Invocation:
                this.handleSubProgram(ctx, stmt.program);
                break;
            case NodeType.Radix:
                ctx.radix = stmt.radix;
                break;
            case NodeType.PunchControl:
                ctx.punchEnabled = stmt.enable;
                break;
            case NodeType.FixTab:
                this.handleFixTab(ctx);
                break;
            case NodeType.Expunge:
                this.handleExpunge(ctx);
                break;
            case NodeType.ChangePage:
                this.handlePage(ctx, stmt);
                break;
            case NodeType.ChangeField:
                this.handleField(ctx, stmt);
                break;
            case NodeType.Reloc:
                this.handleReloc(ctx, stmt);
                break;
        }
    }

    private updateCLC(ctx: Context, stmt: Nodes.Statement) {
        let newClc = this.getClc(ctx, false);

        switch (stmt.type) {
            case NodeType.Origin:
                newClc = this.safeEval(ctx, stmt.val);
                this.setClc(ctx, newClc, true);
                this.punchOrigin(ctx);
                return;
            case NodeType.ZeroBlock:
                newClc += this.safeEval(ctx, stmt.expr);
                break;
            case NodeType.Text:
                newClc += CharSets.asciiStringToDec(stmt.str.str, true).length;
                break;
            case NodeType.DeviceName:
                newClc += 2;
                break;
            case NodeType.FileName:
                newClc += 4;
                break;
            case NodeType.DoubleIntList:
                newClc += stmt.list.filter(x => x.type == NodeType.DoubleInt).length * 2;
                break;
            case NodeType.FloatList:
                newClc += stmt.list.filter(x => x.type == NodeType.Float).length * 3;
                break;
            case NodeType.ExpressionStmt:
                newClc++;
                break;
        }
        this.setClc(ctx, newClc, false);
    }

    private handlePage(ctx: Context, stmt: Nodes.ChangePageStatement) {
        let newPage: number;
        if (!stmt.expr) {
            // subtracting 1 because the cursor is already at the next statement
            const curPage = PDP8.calcPageNum(this.getClc(ctx, true) - 1);
            newPage = curPage + 1;
        } else {
            newPage = this.safeEval(ctx, stmt.expr);
            if (newPage < 0 || newPage >= PDP8.NumPages) {
                throw this.mkError(`Invalid page ${newPage}`, stmt);
            }
        }
        this.setClc(ctx, PDP8.firstAddrInPage(newPage), true);
        this.linkTable.checkOverlap(PDP8.calcPageNum(this.getClc(ctx, true)));
        if (ctx.generateCode) {
            this.punchOrigin(ctx);
        }
    }

    private handleField(ctx: Context, stmt: Nodes.ChangeFieldStatement) {
        const field = this.safeEval(ctx, stmt.expr);
        if (field < 0 || field >= PDP8.NumFields) {
            throw this.mkError(`Invalid field ${field}`, stmt);
        }

        ctx.field = field;
        if (ctx.reloc) {
            throw this.mkError("Changing FIELD with active reloc not supported", stmt);
        }
        this.setClc(ctx, PDP8.firstAddrInPage(1), false);
        if (ctx.generateCode) {
            this.outputLinks(ctx);
            this.linkTable.clear();
            this.punchField(ctx, field);
            this.punchOrigin(ctx);
        }
    }

    private handleReloc(ctx: Context, stmt: Nodes.RelocStatement) {
        if (!stmt.expr) {
            ctx.reloc = 0;
        } else {
            const reloc = this.safeEval(ctx, stmt.expr);
            ctx.reloc = reloc - this.getClc(ctx, false);
        }
    }

    private handleIfDef(ctx: Context, stmt: Nodes.IfDefStatement | Nodes.IfNotDefStatement) {
        const sym = this.syms.tryLookup(stmt.symbol.token.symbol);
        if ((sym && stmt.type == NodeType.IfDef) || (!sym && stmt.type == NodeType.IfNotDef)) {
            this.handleConditionBody(ctx, stmt.body);
        }
    }

    private handleIfZero(ctx: Context, stmt: Nodes.IfZeroStatement | Nodes.IfNotZeroStatement) {
        // It's allowed to use IFZERO with undefined expressions if they are later defined
        // However, that only makes sense if the bodies don't generate code.
        // Otherwise, we would get different CLCs after the body in pass 1 vs 2.
        // We will notice that later because parsing happens in pass 1 and execution in pass 2 where the body
        // will be unparsed if this happens.
        const exVal = this.tryEval(ctx, stmt.expr);
        const val = (exVal === null ? 0 : exVal);

        if ((val == 0 && stmt.type == NodeType.IfZero) || (val != 0 && stmt.type == NodeType.IfNotZero)) {
            this.handleConditionBody(ctx, stmt.body);
        } else {
            if (stmt.body.parsed) {
                throw this.mkError("Condition was true in pass 1, now false -> Illegal", stmt.body);
            }
        }
    }

    private handleConditionBody(ctx: Context, body: Nodes.MacroBody) {
        if (!ctx.generateCode) {
            const name = body.token.cursor.inputName + `:ConditionOnLine${body.token.cursor.lineIdx + 1}`;
            const parser = new Parser(name, body.token.body);
            body.parsed = parser.parseProgram();
        } else {
            if (!body.parsed) {
                throw this.mkError("Condition was false in pass 1, now true -> Illegal", body);
            }
        }
        const errors = this.handleSubProgram(ctx, body.parsed);
        if (errors.length > 0) {
            // TODO: We can't pass errors upwards yet, so just rethrow the first one
            throw errors[0];
        }
    }

    private handleSubProgram(ctx: Context, program: Nodes.Program): CodeError[] {
        if (!ctx.generateCode) {
            return this.assignSymbols(ctx, program);
        } else {
            return this.assembleProgram(ctx, program);
        }
    }

    private handleFixTab(ctx: Context) {
        if (!ctx.generateCode) {
            this.syms.fix();
        }
    }

    private handleExpunge(ctx: Context) {
        if (!ctx.generateCode) {
            this.syms.expunge();
        }
    }

    private handleExprStmt(ctx: Context, stmt: Nodes.ExpressionStatement): boolean {
        const val = this.safeEval(ctx, stmt.expr);
        this.punchData(ctx, this.getClc(ctx, false), val);
        return true;
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
            case NodeType.Integer:        return parseIntSafe(expr.token.value, ctx.radix) & 0o7777;
            case NodeType.ASCIIChar:      return CharSets.asciiCharTo7Bit(expr.token.char, true);
            case NodeType.Symbol:         return this.evalSymbol(ctx, expr);
            case NodeType.CLCValue:       return this.getClc(ctx, true);
            case NodeType.UnaryOp:        return this.evalUnary(ctx, expr);
            case NodeType.ParenExpr:      return this.evalParenExpr(ctx, expr);
            case NodeType.SymbolGroup:    return this.evalSymbolGroup(ctx, expr);
            case NodeType.BinaryOp:       return this.evalBinOp(ctx, expr);
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
        }

        // OR all operands
        let acc = this.tryEval(ctx, group.first);
        for (const e of group.exprs) {
            let val;
            if (e.type == NodeType.BinaryOp && acc !== null) {
                // the accumulator input is used for a syntax like CDF 1+1 -> must eval as ((CFD OR 1) + 1)
                acc = this.evalBinOpAcc(ctx, e, acc);
            } else {
                val = this.tryEval(ctx, e);
                if (val === null || acc === null) {
                    acc = null;
                } else {
                    acc |= val;
                }
            }
        }
        return acc;
    }

    private evalMRI(ctx: Context, group: Nodes.SymbolGroup): number | null {
        const mri = this.syms.lookup(group.first.token.symbol);

        // upper 5 bits
        let mriVal = mri.value;

        // full 12 bits destination
        let dst = 0;

        for (let i = 0; i < group.exprs.length; i++) {
            const ex = group.exprs[i];
            if (ex.type == NodeType.Symbol) {
                const sym = this.syms.tryLookup(ex.token.symbol);
                if (!sym) {
                    return null;
                } else if (sym.type == SymbolType.Permanent && i == 0) {
                    // permanent symbols are only allowed as first symbol after the MRI, otherwise they act on dst
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
        return this.calcOp(binOp, lhs, rhs);
    }

    private evalBinOpAcc(ctx: Context, binOp: Nodes.BinaryOp, acc: number): number | null {
        let lhs;
        if (binOp.lhs.type == NodeType.BinaryOp) {
            lhs = this.evalBinOpAcc(ctx, binOp.lhs, acc);
        } else {
            lhs = this.tryEval(ctx, binOp.lhs);
            if (lhs !== null) {
                lhs |= acc;
            }
        }
        const rhs = this.tryEval(ctx, binOp.rhs);
        return this.calcOp(binOp, lhs, rhs);
    }

    private calcOp(binOp: Nodes.BinaryOp, lhs: number | null, rhs: number | null): number | null {
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

    private isMRIExpr(expr: Nodes.Expression): boolean {
        // An MRI expression needs to start with an MRI op followed by a space -> group
        if (expr.type != NodeType.SymbolGroup) {
            return false;
        }

        const sym = this.syms.tryLookup(expr.first.token.symbol);
        if (!sym || sym.type != SymbolType.Fixed) {
            return false;
        }

        // check if FIXTAB with auto-MRI detection
        return sym.forceMri || PDP8.isMRIOp(sym.value);
    }

    // 5 bits MRI + 12 bits destination to 5 + 7 bits by adding links or dst being on page or on page zero
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

    private outputZBlock(ctx: Context, stmt: Nodes.ZBlockStatement): boolean {
        let loc = this.getClc(ctx, false);
        const num = this.safeEval(ctx, stmt.expr);
        for (let i = 0; i < num; i++) {
            this.punchData(ctx, loc, 0);
            loc++;
        }
        return true;
    }

    private outputText(ctx: Context, text: string): boolean {
        const outStr = CharSets.asciiStringToDec(text, true);
        const addr = this.getClc(ctx, false);
        outStr.forEach((w, i) => this.punchData(ctx, addr + i, w));
        return true;
    }

    private outputFileName(ctx: Context, text: string): boolean {
        const outStr = CharSets.asciiStringToOS8Name(text);
        const addr = this.getClc(ctx, false);
        outStr.forEach((w, i) => this.punchData(ctx, addr + i, w));
        return true;
    }

    private outputDeviceName(ctx: Context, name: string): boolean {
        const dev = name.padEnd(4, "\0");
        const outStr = CharSets.asciiStringToDec(dev, false);
        const addr = this.getClc(ctx, false);
        outStr.forEach((w, i) => this.punchData(ctx, addr + i, w));
        return true;
    }

    private outputDubl(ctx: Context, stmt: Nodes.DoubleIntList): boolean {
        if (stmt.list.length == 0) {
            return false;
        }

        let loc = this.getClc(ctx, false);
        for (const dubl of stmt.list) {
            if (dubl.type != NodeType.DoubleInt) {
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
            if (fltg.type != NodeType.Float) {
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
        let curAddr = ctx.clc;
        this.linkTable.visit((addr, val) => {
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
