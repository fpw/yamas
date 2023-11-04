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
import { CodeError } from "../utils/CodeError.js";
import * as PDP8 from "../utils/PDP8.js";
import { Context } from "./Context.js";
import { LinkTable } from "./LinkTable.js";
import { SymbolData, SymbolTable } from "./SymbolTable.js";
import { DataAssembler } from "./assemblers/DataAssembler.js";
import { MacroAssembler } from "./assemblers/MacroAssembler.js";
import { OriginAssembler } from "./assemblers/OriginAssembler.js";
import { SymbolAssembler } from "./assemblers/SymbolAssembler.js";
import { ExprEvaluator } from "./util/ExprEvaluator.js";
import { OutputFilter } from "./util/OutputFilter.js";
import { RegisterFunction, StatementEffect, StatementHandler } from "./util/StatementEffect.js";

export interface OutputHandler {
    changeOrigin(clc: number): void;
    changeField(field: number): void;
    writeValue(clc: number, val: number): void;
}

export interface AssemblerOptions extends ParserOptions {
    orDoesShift?: boolean;  // like /B in PAL8: A!B becomes A * 100 + B
    noNullTermination?: boolean; // like /F in PAL8: do not null-terminate even-length TEXTs
    forgetLiterals?: boolean; // like /W in PAL8: punch and clear literals on PAGE
}

export class Assembler {
    private opts: AssemblerOptions;
    private syms = new SymbolTable();
    private output: OutputFilter;
    private evaluator: ExprEvaluator;
    private programs: Nodes.Program[] = [];
    private linkTable = new LinkTable();

    private stmtHandlers: StatementHandler<Nodes.Statement>[] = [];
    private dataAssembler: DataAssembler;
    private macroAssembler: MacroAssembler;
    private symAssembler: SymbolAssembler;
    private originAssembler: OriginAssembler;

    public constructor(options: AssemblerOptions) {
        this.opts = options;
        this.output = new OutputFilter(this.opts);
        this.evaluator = new ExprEvaluator(this.opts, this.syms, this.linkTable);

        this.dataAssembler = new DataAssembler(this.opts, this.output, this.evaluator);
        this.dataAssembler.registerHandlers(this.register.bind(this));

        this.macroAssembler = new MacroAssembler(this.opts, this.syms, this.output, this.evaluator);
        this.macroAssembler.registerHandlers(this.register.bind(this));

        this.symAssembler = new SymbolAssembler(this.opts, this.syms, this.evaluator);
        this.symAssembler.registerHandlers(this.register.bind(this));

        this.originAssembler = new OriginAssembler(this.opts, this.evaluator);
        this.originAssembler.registerHandlers(this.register.bind(this));

        this.registerHandlers(this.register.bind(this));

        this.syms.definePermanent("I", 0o400);
        this.syms.definePermanent("Z", 0);

        // register pseudos as such so that we get errors if code redefines them
        Parser.SupportedPseudos
            .filter(k => !this.opts.disabledPseudos?.includes(k))
            .forEach(k => this.syms.definePseudo(k));
    }

    private registerHandlers(register: RegisterFunction) {
        const nullEffect = (ctx: Context, stmt: Nodes.Statement): StatementEffect => ({});

        register(NodeType.Eject, nullEffect);
        register(NodeType.XList, nullEffect);
    }

    private register<T extends Nodes.Statement>(type: T["type"], handler: StatementHandler<T>) {
        if (this.stmtHandlers[type]) {
            throw Error(`Multiple handlers for ${Nodes.NodeType[type]}`);
        }

        // storing as if it was a generic handler for any handler, so promise:
        // only calling [x] with matching type index
        this.stmtHandlers[type] = handler as StatementHandler<Nodes.Statement>;
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
        // protect against being called with parse errors present
        const parseErrors = this.programs.map(p => p.errors).flat();
        if (parseErrors.length > 0) {
            return parseErrors;
        }

        // pass 1: assign all symbols and links that can be evaluated in a single pass
        const pass1Errors = this.doPass(false);
        if (pass1Errors.length > 0) {
            return pass1Errors;
        }

        // pass 2: generate code and assign missing symbols and links on the go
        // we must clear the link table because it's possible that the previous pass left it
        // in another field, so we'll just fill it again in pass 2
        this.linkTable.clear();
        const pass2Errors = this.doPass(true);
        if (pass2Errors.length > 0) {
            return pass2Errors;
        }

        return [];
    }

    private doPass(generateCode: boolean) {
        const errors: CodeError[] = [];

        const ctx = new Context(generateCode);

        this.output.punchOrigin(ctx);

        for (const prog of this.programs) {
            const asmErrors = this.assembleProgram(ctx, prog);
            errors.push(...asmErrors);
        }

        this.output.punchOrigin(ctx);
        this.outputLinks(ctx);

        return errors;
    }

    private assembleProgram(ctx: Context, prog: Nodes.Program): CodeError[] {
        const errors: CodeError[] = [];
        for (const stmt of prog.stmts) {
            try {
                const subErrors = this.handleStatement(ctx, stmt);
                errors.push(...subErrors);
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

    private handleStatement(ctx: Context, stmt: Nodes.Statement): CodeError[] {
        const handler = this.stmtHandlers[stmt.type];
        if (!handler) {
            return [];
        }

        const effect = handler(ctx, stmt);

        if (effect.incClc !== undefined) {
            this.incClc(ctx, effect.incClc);
        }

        if (effect.changeField !== undefined) {
            this.changeField(ctx, effect.changeField);
        }

        if (effect.relocClc !== undefined) {
            this.relocClc(ctx, effect.relocClc);
        }

        if (effect.assembleSubProgram) {
            const subErrors = this.assembleProgram(ctx, effect.assembleSubProgram);
            return subErrors;
        }
        return [];
    }

    private relocClc(ctx: Context, newClc: number) {
        const oldPage = PDP8.calcPageNum(ctx.getClc(true));
        ctx.setClc(newClc, true);
        const newPage = PDP8.calcPageNum(ctx.getClc(true));

        if (this.opts.forgetLiterals && oldPage != newPage) {
            this.outputLinks(ctx);
            this.linkTable.clear();
        }

        this.output.punchOrigin(ctx);
    }

    private incClc(ctx: Context, incClc: number) {
        // we just put something in interval [current CLC, current CLC + incClc)
        // -> check if it overlapped with a link by checking the last written address
        const oldClc = ctx.getClc(false);
        const newClc = oldClc + incClc;
        const lastWrite = newClc - 1;
        this.linkTable.checkOverlap(lastWrite);
        ctx.setClc(newClc, false);
    }

    private changeField(ctx: Context, field: number) {
        ctx.field = field;
        this.outputLinks(ctx);
        ctx.setClc(PDP8.firstAddrInPage(1), false);
        this.output.punchField(ctx, field);
        this.output.punchOrigin(ctx);
        this.linkTable.clear();
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
}
