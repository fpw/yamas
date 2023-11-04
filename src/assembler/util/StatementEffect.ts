import { Node, Program, Statement } from "../../parser/Node.js";
import { Context } from "../Context.js";

export type StatementHandler<T extends Node> = (ctx: Context, stmt: T) => StatementEffect;
export type RegisterFunction =  <T extends Statement>(type: T["type"], handler: StatementHandler<T>) => void;

export interface StatementEffect {
    // increase CLC by given amount
    incClc?: number;

    // set CLC to new value with relocation
    relocClc?: number;

    // change current field
    changeField?: number;

    // assembler and execute a sub-program
    assembleSubProgram?: Program;
}
