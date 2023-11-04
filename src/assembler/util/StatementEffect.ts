import { Program, Statement } from "../../index.js";
import { Context } from "../Context.js";

export type StatementHandler = (ctx: Context, stmt: Statement) => StatementEffect;

export interface StatementEffect {
    // increase CLC by given amount
    incClc?: number;

    // set CLC to new value with relocation
    relocClc?: number;

    // change current field
    changeField?: number;

    // assembler and execute a sub-program
    executeProgram?: Program;
}
