// ------------------------------
// | Validation Values
// ------------------------------
const findCommands = ["f", "F", "t", "T"] as const;
const findCommandSet: ReadonlySet<string> = new Set(findCommands);

const insertCommands = ["i", "I", "a", "A", "o", "O"] as const;
const insertCommandSet: ReadonlySet<string> = new Set(insertCommands);

const operators = ["d", "c", "y", ">", "<"] as const;
const operatorSet: ReadonlySet<string> = new Set(operators);

// prettier-ignore
const motions = [
    "h", "j", "k", "l", "w", "W", "b", "B", "e", "E",
    "0", "$", "^", "_", "gg", "G", "H", "L", "%", "-",
    "+",
] as const;
const motionSet: ReadonlySet<string> = new Set(motions);

const sugars = ["s", "S", "x", "X", "D", "C", "Y"] as const;
const sugarSet: ReadonlySet<string> = new Set(sugars);

const standalones = ["J", "p", "P", "r", "R", "u", "<C-r>"] as const;
const standaloneSet: ReadonlySet<string> = new Set(standalones);

const textObjectModifiers = ["i", "a"] as const;
const textObjectModifierSet: ReadonlySet<string> = new Set(textObjectModifiers);
// prettier-ignore
const textObjectTypes = [
    "w", "W", "p", "s", "t", "(", ")", "{", "}",
    "[", "]", ">", "<", '"', "'", "`",
] as const;
const textObjectTypeSet: ReadonlySet<string> = new Set(textObjectTypes);

const scrollCommands = ["<C-u>", "<C-d>", "<C-f>", "<C-b>"] as const;
const scrollCommandSet: ReadonlySet<string> = new Set(scrollCommands);

// ------------------------------
// | Validation Types
// ------------------------------
export type FindCommand = (typeof findCommands)[number];
export type InsertCommand = (typeof insertCommands)[number];
export type Operator = (typeof operators)[number];
export type Motion = (typeof motions)[number];
export type Sugar = (typeof sugars)[number];
export type Standalone = (typeof standalones)[number];
export type TextObjectModifier = (typeof textObjectModifiers)[number];
export type TextObjectType = (typeof textObjectTypes)[number];
export type ScrollCommand = (typeof scrollCommands)[number];

// ------------------------------
// | Validations
// ------------------------------
export const isFindCommand = (ch: string): ch is FindCommand => {
    return findCommandSet.has(ch);
};

export const isInsertCommand = (ch: string): ch is InsertCommand => {
    return insertCommandSet.has(ch);
};

export const isOperator = (ch: string): ch is Operator => {
    return operatorSet.has(ch);
};

export const isMotion = (ch: string): ch is Motion => {
    return motionSet.has(ch);
};

export const isSugar = (ch: string): ch is Sugar => {
    return sugarSet.has(ch);
};

export const isStandalone = (ch: string): ch is Standalone => {
    return standaloneSet.has(ch);
};

export const isTextObjectModifier = (ch: string): ch is TextObjectModifier => {
    return textObjectModifierSet.has(ch);
};

export const isTextObjectType = (ch: string): ch is TextObjectType => {
    return textObjectTypeSet.has(ch);
};

export const isScrollCommand = (token: string): token is ScrollCommand => {
    return scrollCommandSet.has(token);
};
