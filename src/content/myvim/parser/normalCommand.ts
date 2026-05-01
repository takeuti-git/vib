// ------------------------------
// | Validation Values
// ------------------------------
const findCommands = ["f", "F", "t", "T"] as const;
const findCommandSet: ReadonlySet<string> = new Set(findCommands);

const operators = ["d", "c", "y", ">", "<"] as const;
const operatorSet: ReadonlySet<string> = new Set(operators);

// prettier-ignore
const motions = [
    "h", "j", "k", "l", "w", "W", "b", "B", "e", "E",
    "0", "$", "^", "_", "gg", "G", "H", "L", "%", "-",
    "+", "Enter",
] as const;
const motionSet: ReadonlySet<string> = new Set(motions);

const textObjectModifiers = ["i", "a"] as const;
const textObjectModifierSet: ReadonlySet<string> = new Set(textObjectModifiers);
// prettier-ignore
const textObjectTypes = [
    "w", "W", "p", "s", "t", "(", ")", "{", "}",
    "[", "]", ">", "<", '"', "'", "`",
] as const;
const textObjectTypeSet: ReadonlySet<string> = new Set(textObjectTypes);

const macroRecordCommand = "q" as const;
const macroPlayCommand = "@" as const;


// ------------------------------
// | Validation Types
// ------------------------------
export type GoInsertCommand = "i" | "a" | "I" | "A" | "o" | "O";
export type GoReplaceCommand = "R";
export type GoVisualCommand = "v" | "V";
export type FindCommand = (typeof findCommands)[number];
export type Operator = (typeof operators)[number];
export type Motion = (typeof motions)[number];
export type SugarCommand = "s" | "S" | "x" | "X" | "D" | "C" | "Y";
export type JoinCommand = "J";
export type PutCommand = "p" | "P" | "<C-v>";
export type UndoCommand = "u";
export type RedoCommand = "<C-r>";
export type ReplaceCommand = "r";
export type TextObjectModifier = (typeof textObjectModifiers)[number];
export type TextObjectType = (typeof textObjectTypes)[number];
export type ScrollCommand = "<C-u>" | "<C-d>" | "<C-f>" | "<C-b>";
export type SwitchCaseCommand = "~";
export type RepeatOperatorCommand = ".";
export type RepeatMotionCommand = ";" | ",";
export type MacroRecordCommand = typeof macroRecordCommand;
export type MacroPlayCommand = "@";

// ------------------------------
// | Validations
// ------------------------------
export const isFindCommand = (ch: string): ch is FindCommand => {
    return findCommandSet.has(ch);
};

export const isOperator = (ch: string): ch is Operator => {
    return operatorSet.has(ch);
};

export const isMotion = (ch: string): ch is Motion => {
    return motionSet.has(ch);
};

export const isTextObjectModifier = (ch: string): ch is TextObjectModifier => {
    return textObjectModifierSet.has(ch);
};

export const isTextObjectType = (ch: string): ch is TextObjectType => {
    return textObjectTypeSet.has(ch);
};

export const isMacroRecordCommand = (ch: string): ch is MacroRecordCommand => {
    return macroRecordCommand === ch;
};

export const isMacroPlayCommand = (ch: string): ch is MacroPlayCommand => {
    return macroPlayCommand === ch;
}
