/*
 *   Yamas - Yet Another Macro Assembler (for the PDP-8)
 *   Copyright (C) 2023 Folke Will <folko@solhost.org>
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as Nodes from "../parser/Node.js";
import { NodeType } from "../parser/Node.js";
import { Parser, ParserOptions } from "../parser/Parser.js";
import * as CharSets from "../utils/CharSets.js";
import { CodeError } from "../utils/CodeError.js";
import * as PDP8 from "../utils/PDP8.js";
import { Context } from "./Context.js";
import { LinkTable } from "./LinkTable.js";
import { SymbolData, SymbolTable } from "./SymbolTable.js";
import { Evaluator } from "./util/Evaluator.js";
import { OutputGenerator } from "./util/OutputGenerator.js";

export interface OutputHandler {
    changeOrigin(clc: number): void;
    changeField(field: number): void;
    writeValue(clc: number, val: number): void;
}

export interface AssemblerOptions extends ParserOptions {
}

export class Assembler {
    private opts: AssemblerOptions;
    private syms = new SymbolTable();
    private output = new OutputGenerator();
    private programs: Nodes.Program[] = [];
    private linkTable = new LinkTable();
    private evaluator = new Evaluator(this.syms, this.linkTable);

    public constructor(options: AssemblerOptions) {
        this.opts = options;
        this.syms.definePermanent("I", 0o400);
        this.syms.definePermanent("Z", 0);

        // register pseudos as such so that we get errors if code redefines them
        Parser.SupportedPseudos
            .filter(k => !this.opts.disabledPseudos?.includes(k))
            .forEach(k => this.syms.definePseudo(k));
    }

    public setOutputHandler(out: OutputHandler) {
        this.output.setOutputHandler(out);
    }

    public parseInput(name: string, input: string): Nodes.Program {
        const parser = new Parser(this.opts, name, input);
        const prog = parser.parseProgram();
        this.programs.push(prog);
        return prog;
    }

    public getSymbols(): SymbolData[] {
        return this.syms.getSymbols();
    }

    public assembleAll(): CodeError[] {
        const errors: CodeError[] = this.programs.map(p => p.errors).flat();

        // pass 1: assign all symbols that can be evaluated in a single pass
        const symCtx = new Context(false);
        for (const prog of this.programs) {
            const symErrors = this.assignSymbols(symCtx, prog);
            errors.push(...symErrors);
        }
        if (errors.length > 0) {
            return errors;
        }

        // pass 2: generate code and assign missing symbols on the go
        this.linkTable.clear();
        const asmCtx = new Context(true);
        this.output.punchOrigin(asmCtx);
        for (const prog of this.programs) {
            const asmErrors = this.assembleProgram(asmCtx, prog);
            errors.push(...asmErrors);
        }

        this.outputLinks(asmCtx);

        return errors;
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
        const out = this.output;
        let gen = false;
        switch (stmt.type) {
            case NodeType.ZeroBlock:        gen = this.handleZBlock(ctx, stmt); break;
            case NodeType.Text:             gen = out.outputText(ctx, stmt.str.str); break;
            case NodeType.DoubleIntList:    gen = out.outputDubl(ctx, stmt); break;
            case NodeType.FloatList:        gen = out.outputFltg(ctx, stmt); break;
            case NodeType.DeviceName:       gen = out.outputDeviceName(ctx, stmt.name.token.symbol); break;
            case NodeType.FileName:         gen = out.outputFileName(ctx, stmt.name.str); break;
            case NodeType.ExpressionStmt:   gen = this.handleExprStmt(ctx, stmt); break;
        }

        if (gen) {
            // we just put something at CLC - check if it overlaps with a link
            this.linkTable.checkOverlap(ctx.getClc(false));
        }

        // symbols need to be updated here as well because it's possible to use
        // undefined symbols on the right hand side of A=B in pass 1
        this.updateSymbols(ctx, stmt);
        this.updateCLC(ctx, stmt);
    }

    private handleExprStmt(ctx: Context, stmt: Nodes.ExpressionStatement): boolean {
        const val = this.evaluator.safeEval(ctx, stmt.expr);
        this.output.punchData(ctx, ctx.getClc(false), val);
        return true;
    }

    private handleZBlock(ctx: Context, stmt: Nodes.ZBlockStatement): boolean {
        const amount = this.evaluator.safeEval(ctx, stmt.expr);
        this.output.outputZBlock(ctx, amount);
        return true;
    }

    // eslint-disable-next-line max-lines-per-function
    private updateSymbols(ctx: Context, stmt: Nodes.Statement) {
        switch (stmt.type) {
            case NodeType.Assignment:
                const paramVal = this.evaluator.tryEval(ctx, stmt.val);
                // undefined expressions lead to undefined symbols
                if (paramVal !== null) {
                    this.syms.defineParameter(stmt.sym.token.symbol, paramVal);
                }
                break;
            case NodeType.FixMri:
                const val = this.evaluator.safeEval(ctx, stmt.assignment.val);
                this.syms.defineForcedMri(stmt.assignment.sym.token.symbol, val);
                break;
            case NodeType.Label:
                this.syms.defineLabel(stmt.sym.token.symbol, ctx.getClc(true));
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
        let newClc = ctx.getClc(false);

        switch (stmt.type) {
            case NodeType.Origin:
                newClc = this.evaluator.safeEval(ctx, stmt.val);
                ctx.setClc(newClc, true);
                this.output.punchOrigin(ctx);
                return;
            case NodeType.ZeroBlock:
                newClc += this.evaluator.safeEval(ctx, stmt.expr);
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
        ctx.setClc(newClc, false);
    }

    private handlePage(ctx: Context, stmt: Nodes.ChangePageStatement) {
        let newPage: number;
        if (!stmt.expr) {
            // subtracting 1 because the cursor is already at the next statement
            const curPage = PDP8.calcPageNum(ctx.getClc(true) - 1);
            newPage = curPage + 1;
        } else {
            newPage = this.evaluator.safeEval(ctx, stmt.expr);
            if (newPage < 0 || newPage >= PDP8.NumPages) {
                throw Assembler.mkError(`Invalid page ${newPage}`, stmt);
            }
        }
        ctx.setClc(PDP8.firstAddrInPage(newPage), true);
        this.linkTable.checkOverlap(PDP8.calcPageNum(ctx.getClc(true)));
        if (ctx.generateCode) {
            this.output.punchOrigin(ctx);
        }
    }

    private handleField(ctx: Context, stmt: Nodes.ChangeFieldStatement) {
        const field = this.evaluator.safeEval(ctx, stmt.expr);
        if (field < 0 || field >= PDP8.NumFields) {
            throw Assembler.mkError(`Invalid field ${field}`, stmt);
        }

        ctx.field = field;
        if (ctx.reloc) {
            throw Assembler.mkError("Changing FIELD with active reloc not supported", stmt);
        }
        ctx.setClc(PDP8.firstAddrInPage(1), false);
        if (ctx.generateCode) {
            this.outputLinks(ctx);
            this.linkTable.clear();
            this.output.punchField(ctx, field);
            this.output.punchOrigin(ctx);
        }
    }

    private handleReloc(ctx: Context, stmt: Nodes.RelocStatement) {
        if (!stmt.expr) {
            ctx.reloc = 0;
        } else {
            const reloc = this.evaluator.safeEval(ctx, stmt.expr);
            ctx.reloc = reloc - ctx.getClc(false);
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
        const exVal = this.evaluator.tryEval(ctx, stmt.expr);
        const val = (exVal === null ? 0 : exVal);

        if ((val == 0 && stmt.type == NodeType.IfZero) || (val != 0 && stmt.type == NodeType.IfNotZero)) {
            this.handleConditionBody(ctx, stmt.body);
        } else {
            if (stmt.body.parsed) {
                throw Assembler.mkError("Condition was true in pass 1, now false -> Illegal", stmt.body);
            }
        }
    }

    private handleConditionBody(ctx: Context, body: Nodes.MacroBody) {
        if (!ctx.generateCode) {
            const name = body.token.cursor.inputName + `:ConditionOnLine${body.token.cursor.lineIdx + 1}`;
            const parser = new Parser(this.opts, name, body.token.body);
            body.parsed = parser.parseProgram();
        } else {
            if (!body.parsed) {
                throw Assembler.mkError("Condition was false in pass 1, now true -> Illegal", body);
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

    private outputLinks(ctx: Context) {
        let curAddr = ctx.getClc(false);
        this.linkTable.visit((addr, val) => {
            if (curAddr != addr) {
                curAddr = addr;
                this.output.punchOrigin(ctx, curAddr);
            }
            this.output.punchData(ctx, curAddr, val);
            curAddr++;
        });
    }

    public static mkError(msg: string, node: Nodes.Node) {
        return Parser.mkNodeError(msg, node);
    }
}
